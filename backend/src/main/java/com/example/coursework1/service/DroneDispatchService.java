package com.example.coursework1.service;

import com.example.coursework1.dto.*;
import com.example.coursework1.model.Position;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class DroneDispatchService {

    private static final Logger logger = LoggerFactory.getLogger(DroneDispatchService.class);

    private final DeliveryPlannerService plannerService;
    private final DroneService droneService;
    private final ServicePointService servicePointService;
    private final SimpMessagingTemplate messagingTemplate;

    // Track active drones and their states
    private final Map<String, ActiveDroneState> activeDrones = new ConcurrentHashMap<>();
    private final AtomicInteger deliveryIdCounter = new AtomicInteger(1000);

    public DroneDispatchService(DeliveryPlannerService plannerService,
                                DroneService droneService,
                                ServicePointService servicePointService,
                                SimpMessagingTemplate messagingTemplate) {
        this.plannerService = plannerService;
        this.droneService = droneService;
        this.servicePointService = servicePointService;
        this.messagingTemplate = messagingTemplate;

        // CRITICAL FIX: Clear any stale state from previous sessions
        logger.info("🚁 DroneDispatchService initializing - clearing stale state");
        activeDrones.clear();
        logger.info("✅ DroneDispatchService ready - activeDrones map cleared (size: {})", activeDrones.size());
    }

    /**
     * Submit a new delivery request - finds available drone and dispatches immediately
     */
    public DeliverySubmissionResult submitDelivery(DeliveryRequest request) {
        logger.info("📦 New delivery request: capacity={}, cooling={}, heating={}, location=({}, {})",
                request.getCapacity(), request.isCooling(), request.isHeating(),
                request.getLatitude(), request.getLongitude());

        // Generate delivery ID
        int deliveryId = deliveryIdCounter.getAndIncrement();

        // Create dispatch record
        MedDispatchRec dispatch = new MedDispatchRec(
                deliveryId,
                "2025-01-01", // Dummy date (ignoring for now)
                "12:00",      // Dummy time (ignoring for now)
                new Requirements(request.getCapacity(), request.isCooling(),
                        request.isHeating(), null),
                new Position(request.getLongitude(), request.getLatitude())
        );

        // Find available drones based ONLY on capacity/cooling/heating (ignore date/time)
        List<Drone> allDrones = droneService.fetchAllDrones();
        Requirements reqs = dispatch.getRequirements();

        logger.info("🔍 Fetched {} drones from ILP service", allDrones.size());
        logger.info("📋 Requirements: capacity={} kg, cooling={}, heating={}",
                reqs.getCapacity(), reqs.isCooling(), reqs.isHeating());
        logger.info("🔒 Currently active drones: {}", activeDrones.keySet());

        // Log all drones for debugging
        for (Drone drone : allDrones) {
            Capability cap = drone.getCapability();
            if (cap != null) {
                logger.info("  Drone {}: capacity={} kg, cooling={}, heating={}, busy={}",
                        drone.getId(),
                        cap.getCapacity(),
                        cap.isCooling(),
                        cap.isHeating(),
                        activeDrones.containsKey(drone.getId()));
            } else {
                logger.warn("  Drone {}: NULL CAPABILITY", drone.getId());
            }
        }

        List<String> availableDroneIds = allDrones.stream()
                .filter(drone -> {
                    String droneId = drone.getId();

                    // Skip if currently busy
                    if (activeDrones.containsKey(droneId)) {
                        logger.info("  ❌ Drone {} is currently busy", droneId);
                        return false;
                    }

                    // Check capability
                    Capability cap = drone.getCapability();
                    if (cap == null) {
                        logger.info("  ❌ Drone {} has null capability", droneId);
                        return false;
                    }

                    // Check capacity (with tolerance)
                    if (cap.getCapacity() < reqs.getCapacity() - 0.01) {
                        logger.info("  ❌ Drone {} capacity {} kg < required {} kg",
                                droneId, cap.getCapacity(), reqs.getCapacity());
                        return false;
                    }

                    // Check cooling
                    if (reqs.isCooling() && !cap.isCooling()) {
                        logger.info("  ❌ Drone {} missing cooling capability", droneId);
                        return false;
                    }

                    // Check heating
                    if (reqs.isHeating() && !cap.isHeating()) {
                        logger.info("  ❌ Drone {} missing heating capability", droneId);
                        return false;
                    }

                    logger.info("  ✅ Drone {} matches all requirements!", droneId);
                    return true;
                })
                .map(Drone::getId)
                .toList();

        if (availableDroneIds.isEmpty()) {
            logger.error("❌ No available drones for delivery {}", deliveryId);
            logger.error("Required: capacity={} kg, cooling={}, heating={}",
                    reqs.getCapacity(), reqs.isCooling(), reqs.isHeating());
            logger.error("Active drones: {}", activeDrones.keySet());
            logger.error("Total drones fetched: {}", allDrones.size());

            // Build detailed error message
            String errorMsg;
            if (allDrones.isEmpty()) {
                errorMsg = "ERROR: No drones fetched from ILP service. Check backend connection to ILP REST API.";
            } else {
                errorMsg = String.format("No drones match requirements (need %.1f kg, cooling=%s, heating=%s). Check console logs.",
                        reqs.getCapacity(), reqs.isCooling(), reqs.isHeating());
            }

            return new DeliverySubmissionResult(
                    false,
                    deliveryId,
                    null,
                    errorMsg
            );
        }

        logger.info("✅ Found {} available drones: {}", availableDroneIds.size(), availableDroneIds);

        // Select best drone (closest to delivery location)
        List<ServicePoint> servicePoints = servicePointService.fetchAllServicePoints();
        Position base = servicePoints.isEmpty() ?
                new Position(-3.1892, 55.9445) :  // Default Edinburgh coordinates
                new Position(servicePoints.get(0).getLocation().getLng(),
                        servicePoints.get(0).getLocation().getLat());

        Drone selectedDrone = selectBestDrone(availableDroneIds, allDrones,
                dispatch.getDelivery(), base);

        if (selectedDrone == null) {
            logger.error("❌ Failed to select drone from available list");
            return new DeliverySubmissionResult(false, deliveryId, null,
                    "Drone selection failed");
        }

        logger.info("✅ Selected drone {} for delivery {}", selectedDrone.getId(), deliveryId);

        // Start async delivery mission
        startDeliveryMission(selectedDrone, dispatch, base);

        return new DeliverySubmissionResult(
                true,
                deliveryId,
                selectedDrone.getId(),
                "Drone dispatched successfully"
        );
    }

    /**
     * Start an async delivery mission for a single drone
     */
    @Async
    public void startDeliveryMission(Drone drone, MedDispatchRec dispatch, Position base) {
        String droneId = drone.getId();
        logger.info("🚁 Starting mission: Drone {} → Delivery {}", droneId, dispatch.getId());

        // Calculate path
        CalcDeliveryResult result = plannerService.calcDeliveryPath(List.of(dispatch));

        if (result.getDronePaths() == null || result.getDronePaths().isEmpty()) {
            logger.error("❌ Pathfinding failed for delivery {}", dispatch.getId());
            broadcastDeliveryFailed(droneId, dispatch.getId(), "Pathfinding failed");
            return;
        }

        DronePathResult pathResult = result.getDronePaths().get(0);

        if (pathResult.getDeliveries().isEmpty()) {
            logger.error("❌ No delivery path for delivery {}", dispatch.getId());
            broadcastDeliveryFailed(droneId, dispatch.getId(), "No valid path");
            return;
        }

        List<LngLat> flightPath = pathResult.getDeliveries().get(0).getFlightPath();

        // Create active drone state
        ActiveDroneState state = new ActiveDroneState(
                droneId,
                dispatch.getId(),
                flightPath,
                drone.getCapability().getCapacity(),
                dispatch.getRequirements().getCapacity()
        );

        activeDrones.put(droneId, state);
        broadcastSystemState();

        logger.info("✈️ Drone {} starting flight with {} waypoints", droneId, flightPath.size());

        // Simulate flight (one position every 300ms)
        try {
            for (int i = 0; i < flightPath.size(); i++) {
                if (!activeDrones.containsKey(droneId)) {
                    logger.warn("⚠️ Drone {} mission cancelled", droneId);
                    break;
                }

                LngLat position = flightPath.get(i);
                state.setCurrentPosition(position);
                state.setStepIndex(i);

                // Determine status
                if (i >= flightPath.size() - 2) {
                    state.setStatus("DELIVERING");
                } else if (i > flightPath.size() / 2) {
                    state.setStatus("RETURNING");
                } else {
                    state.setStatus("FLYING");
                }

                // Broadcast position update
                broadcastDroneUpdate(state);

                Thread.sleep(100); // 300ms per step for smooth animation
            }

            // Mission complete
            logger.info("🎉 Drone {} completed delivery {}", droneId, dispatch.getId());
            state.setStatus("COMPLETED");
            broadcastDroneUpdate(state);

            // Brief pause, then remove from active list
            Thread.sleep(2000);
            activeDrones.remove(droneId);
            broadcastSystemState();
            broadcastDeliveryCompleted(droneId, dispatch.getId());

        } catch (InterruptedException e) {
            logger.warn("⚠️ Drone {} mission interrupted", droneId);
            Thread.currentThread().interrupt();
            activeDrones.remove(droneId);
            broadcastSystemState();
        }
    }

    /**
     * Select best drone based on distance to delivery
     */
    private Drone selectBestDrone(List<String> availableIds, List<Drone> allDrones,
                                  Position deliveryLocation, Position base) {
        Drone bestDrone = null;
        double bestScore = Double.POSITIVE_INFINITY;

        for (String id : availableIds) {
            Drone drone = allDrones.stream()
                    .filter(d -> d.getId().equals(id))
                    .findFirst()
                    .orElse(null);

            if (drone == null) continue;

            // Simple scoring: distance from base to delivery
            double distance = calculateDistance(base, deliveryLocation);

            // Prefer drones with more capacity (tie-breaker)
            double capacityBonus = drone.getCapability().getCapacity() * 0.0001;
            double score = distance - capacityBonus;

            if (score < bestScore) {
                bestScore = score;
                bestDrone = drone;
            }
        }

        return bestDrone;
    }

    private double calculateDistance(Position a, Position b) {
        double dx = a.getLng() - b.getLng();
        double dy = a.getLat() - b.getLat();
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ========== WebSocket Broadcast Methods ==========

    private void broadcastDroneUpdate(ActiveDroneState state) {
        DroneUpdate update = new DroneUpdate();
        update.setDroneId(state.getDroneId());
        update.setDeliveryId(state.getDeliveryId());
        update.setLatitude(state.getCurrentPosition().getLat());
        update.setLongitude(state.getCurrentPosition().getLng());
        update.setStatus(state.getStatus());
        update.setProgress((double) state.getStepIndex() / state.getFlightPath().size());
        update.setCapacityUsed(state.getCapacityUsed());
        update.setTotalCapacity(state.getTotalCapacity());

        messagingTemplate.convertAndSend("/topic/drone-updates", update);
    }

    private void broadcastSystemState() {
        SystemStateUpdate state = new SystemStateUpdate();
        state.setActiveDrones(activeDrones.size());
        state.setAvailableDrones(countAvailableDrones());

        messagingTemplate.convertAndSend("/topic/system-state", state);
    }

    private void broadcastDeliveryCompleted(String droneId, int deliveryId) {
        DeliveryStatusUpdate update = new DeliveryStatusUpdate();
        update.setDeliveryId(deliveryId);
        update.setDroneId(droneId);
        update.setStatus("COMPLETED");
        update.setMessage("✅ Delivery completed successfully!");

        messagingTemplate.convertAndSend("/topic/delivery-status", update);
    }

    private void broadcastDeliveryFailed(String droneId, int deliveryId, String reason) {
        DeliveryStatusUpdate update = new DeliveryStatusUpdate();
        update.setDeliveryId(deliveryId);
        update.setDroneId(droneId);
        update.setStatus("FAILED");
        update.setMessage("❌ " + reason);

        messagingTemplate.convertAndSend("/topic/delivery-status", update);
    }

    private int countAvailableDrones() {
        List<Drone> allDrones = droneService.fetchAllDrones();
        return (int) allDrones.stream()
                .filter(d -> d.getCapability() != null)
                .filter(d -> !activeDrones.containsKey(d.getId()))
                .count();
    }

    public Map<String, ActiveDroneState> getActiveDrones() {
        return new HashMap<>(activeDrones);
    }

    // ========== Inner Classes ==========

    public static class ActiveDroneState {
        private final String droneId;
        private final int deliveryId;
        private final List<LngLat> flightPath;
        private final double totalCapacity;
        private final double capacityUsed;

        private LngLat currentPosition;
        private int stepIndex;
        private String status;

        public ActiveDroneState(String droneId, int deliveryId, List<LngLat> flightPath,
                                double totalCapacity, double capacityUsed) {
            this.droneId = droneId;
            this.deliveryId = deliveryId;
            this.flightPath = flightPath;
            this.totalCapacity = totalCapacity;
            this.capacityUsed = capacityUsed;
            this.currentPosition = flightPath.get(0);
            this.stepIndex = 0;
            this.status = "DEPLOYING";
        }

        // Getters and setters
        public String getDroneId() { return droneId; }
        public int getDeliveryId() { return deliveryId; }
        public List<LngLat> getFlightPath() { return flightPath; }
        public LngLat getCurrentPosition() { return currentPosition; }
        public void setCurrentPosition(LngLat pos) { this.currentPosition = pos; }
        public int getStepIndex() { return stepIndex; }
        public void setStepIndex(int idx) { this.stepIndex = idx; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public double getTotalCapacity() { return totalCapacity; }
        public double getCapacityUsed() { return capacityUsed; }
    }

    // ========== DTOs ==========

    public static class DeliveryRequest {
        private double latitude;
        private double longitude;
        private double capacity;
        private boolean cooling;
        private boolean heating;

        public double getLatitude() { return latitude; }
        public void setLatitude(double lat) { this.latitude = lat; }
        public double getLongitude() { return longitude; }
        public void setLongitude(double lng) { this.longitude = lng; }
        public double getCapacity() { return capacity; }
        public void setCapacity(double cap) { this.capacity = cap; }
        public boolean isCooling() { return cooling; }
        public void setCooling(boolean cooling) { this.cooling = cooling; }
        public boolean isHeating() { return heating; }
        public void setHeating(boolean heating) { this.heating = heating; }
    }

    public static class DeliverySubmissionResult {
        private boolean success;
        private int deliveryId;
        private String droneId;
        private String message;

        public DeliverySubmissionResult(boolean success, int deliveryId,
                                        String droneId, String message) {
            this.success = success;
            this.deliveryId = deliveryId;
            this.droneId = droneId;
            this.message = message;
        }

        public boolean isSuccess() { return success; }
        public int getDeliveryId() { return deliveryId; }
        public String getDroneId() { return droneId; }
        public String getMessage() { return message; }
    }

    public static class DroneUpdate {
        private String droneId;
        private int deliveryId;
        private double latitude;
        private double longitude;
        private String status;
        private double progress;
        private double capacityUsed;
        private double totalCapacity;

        // Getters and setters
        public String getDroneId() { return droneId; }
        public void setDroneId(String id) { this.droneId = id; }
        public int getDeliveryId() { return deliveryId; }
        public void setDeliveryId(int id) { this.deliveryId = id; }
        public double getLatitude() { return latitude; }
        public void setLatitude(double lat) { this.latitude = lat; }
        public double getLongitude() { return longitude; }
        public void setLongitude(double lng) { this.longitude = lng; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public double getProgress() { return progress; }
        public void setProgress(double progress) { this.progress = progress; }
        public double getCapacityUsed() { return capacityUsed; }
        public void setCapacityUsed(double cap) { this.capacityUsed = cap; }
        public double getTotalCapacity() { return totalCapacity; }
        public void setTotalCapacity(double cap) { this.totalCapacity = cap; }
    }

    public static class SystemStateUpdate {
        private int activeDrones;
        private int availableDrones;

        public int getActiveDrones() { return activeDrones; }
        public void setActiveDrones(int n) { this.activeDrones = n; }
        public int getAvailableDrones() { return availableDrones; }
        public void setAvailableDrones(int n) { this.availableDrones = n; }
    }

    public static class DeliveryStatusUpdate {
        private int deliveryId;
        private String droneId;
        private String status;
        private String message;

        public int getDeliveryId() { return deliveryId; }
        public void setDeliveryId(int id) { this.deliveryId = id; }
        public String getDroneId() { return droneId; }
        public void setDroneId(String id) { this.droneId = id; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getMessage() { return message; }
        public void setMessage(String msg) { this.message = msg; }
    }
}