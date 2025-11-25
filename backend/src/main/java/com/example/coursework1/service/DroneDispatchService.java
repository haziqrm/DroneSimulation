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

    // Track active drones - STATIC to survive service recreations
    private static final Map<String, ActiveDroneState> activeDrones = new ConcurrentHashMap<>();
    private static final AtomicInteger deliveryIdCounter = new AtomicInteger(1000);

    // Batch tracking
    private static final Map<String, String> batchToDroneMap = new ConcurrentHashMap<>();
    private static final Map<String, BatchTracker> activeBatchTrackers = new ConcurrentHashMap<>();

    public DroneDispatchService(DeliveryPlannerService plannerService,
                                DroneService droneService,
                                ServicePointService servicePointService,
                                SimpMessagingTemplate messagingTemplate) {
        this.plannerService = plannerService;
        this.droneService = droneService;
        this.servicePointService = servicePointService;
        this.messagingTemplate = messagingTemplate;

        logger.info("🚁 DroneDispatchService initialized - {} active drones", activeDrones.size());
    }

    /**
     * Submit a batch of deliveries
     */
    public Map<String, Object> submitBatch(BatchDeliveryRequest batchRequest) {
        logger.info("📦 Processing batch: {}", batchRequest.getBatchId());

        List<Map<String, Object>> deliveryResults = new ArrayList<>();
        String assignedDroneId = null;

        for (int i = 0; i < batchRequest.getDeliveries().size(); i++) {
            DeliveryRequest delivery = batchRequest.getDeliveries().get(i);

            logger.info("🚁 Processing delivery {}/{}: {}",
                    i + 1, batchRequest.getDeliveries().size(), delivery);

            DeliverySubmissionResult result = submitDeliveryInternal(
                    delivery,
                    batchRequest.getBatchId(),
                    i,
                    batchRequest.getDeliveries().size()
            );

            if (assignedDroneId == null && result.getDroneId() != null) {
                assignedDroneId = result.getDroneId();
                logger.info("🎯 Batch {} assigned to drone: {}", batchRequest.getBatchId(), assignedDroneId);
            }

            Map<String, Object> deliveryResult = new HashMap<>();
            deliveryResult.put("success", result.isSuccess());
            deliveryResult.put("deliveryId", result.getDeliveryId());
            deliveryResult.put("message", result.getMessage());
            deliveryResults.add(deliveryResult);
        }

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "Batch dispatched successfully");
        response.put("batchId", batchRequest.getBatchId());
        response.put("droneId", assignedDroneId);
        response.put("deliveryCount", batchRequest.getDeliveries().size());
        response.put("deliveryResults", deliveryResults);

        logger.info("✅ Batch {} completed. Drone: {}, Deliveries: {}",
                batchRequest.getBatchId(), assignedDroneId, batchRequest.getDeliveries().size());

        return response;
    }

    /**
     * Submit a single delivery
     */
    public DeliverySubmissionResult submitDelivery(DeliveryRequest request) {
        return submitDeliveryInternal(request, null, 0, 1);
    }

    /**
     * Internal delivery submission with batch support
     */
    private DeliverySubmissionResult submitDeliveryInternal(
            DeliveryRequest request,
            String batchId,
            int sequenceInBatch,
            int totalInBatch) {

        logger.info("📦 New delivery request: capacity={}, cooling={}, heating={}, location=({}, {})",
                request.getCapacity(), request.isCooling(), request.isHeating(),
                request.getLatitude(), request.getLongitude());

        int deliveryId = deliveryIdCounter.getAndIncrement();

        MedDispatchRec dispatch = new MedDispatchRec(
                deliveryId,
                "2025-01-01",
                "12:00",
                new Requirements(request.getCapacity(), request.isCooling(),
                        request.isHeating(), null),
                new Position(request.getLongitude(), request.getLatitude())
        );

        // Check if this is part of a batch
        boolean isPartOfBatch = batchId != null;
        String assignedDroneId = null;

        if (isPartOfBatch) {
            logger.info("🔗 Delivery is part of batch: {} ({}/{})",
                    batchId, sequenceInBatch + 1, totalInBatch);

            // Check if we already assigned a drone to this batch
            assignedDroneId = batchToDroneMap.get(batchId);

            if (assignedDroneId != null) {
                logger.info("♻️ Reusing drone {} for batch {}", assignedDroneId, batchId);
            }
        }

        // Find available drones
        List<Drone> allDrones = droneService.fetchAllDrones();
        Requirements reqs = dispatch.getRequirements();

        List<String> availableDroneIds;

        if (assignedDroneId != null) {
            // Use the drone already assigned to this batch
            availableDroneIds = List.of(assignedDroneId);
        } else {
            // Find available drones
            availableDroneIds = allDrones.stream()
                    .filter(drone -> {
                        String droneId = drone.getId();

                        if (activeDrones.containsKey(droneId)) {
                            return false;
                        }

                        Capability cap = drone.getCapability();
                        if (cap == null) return false;
                        if (cap.getCapacity() < reqs.getCapacity() - 0.01) return false;
                        if (reqs.isCooling() && !cap.isCooling()) return false;
                        if (reqs.isHeating() && !cap.isHeating()) return false;

                        return true;
                    })
                    .map(Drone::getId)
                    .toList();
        }

        if (availableDroneIds.isEmpty()) {
            logger.error("❌ No available drones for delivery {}", deliveryId);
            return new DeliverySubmissionResult(false, deliveryId, null,
                    "No drones match requirements");
        }

        List<ServicePoint> servicePoints = servicePointService.fetchAllServicePoints();
        Position base = servicePoints.isEmpty() ?
                new Position(-3.1892, 55.9445) :
                new Position(servicePoints.get(0).getLocation().getLng(),
                        servicePoints.get(0).getLocation().getLat());

        Drone selectedDrone = selectBestDrone(availableDroneIds, allDrones,
                dispatch.getDelivery(), base);

        if (selectedDrone == null) {
            logger.error("❌ Failed to select drone");
            return new DeliverySubmissionResult(false, deliveryId, null,
                    "Drone selection failed");
        }

        // Cache drone for batch if needed
        if (isPartOfBatch && assignedDroneId == null) {
            batchToDroneMap.put(batchId, selectedDrone.getId());
            activeBatchTrackers.put(selectedDrone.getId(),
                    new BatchTracker(batchId, totalInBatch));
            logger.info("🎯 Assigned drone {} to batch {}", selectedDrone.getId(), batchId);
        }

        logger.info("✅ Selected drone {} for delivery {}", selectedDrone.getId(), deliveryId);

        // Start mission
        startDeliveryMission(selectedDrone, dispatch, base, batchId, sequenceInBatch, totalInBatch);

        return new DeliverySubmissionResult(
                true,
                deliveryId,
                selectedDrone.getId(),
                "Drone dispatched successfully"
        );
    }

    /**
     * Start delivery mission with batch tracking
     */
    @Async
    public void startDeliveryMission(Drone drone, MedDispatchRec dispatch, Position base,
                                     String batchId, int sequenceInBatch, int totalInBatch) {
        String droneId = drone.getId();
        logger.info("🚁 Starting mission: Drone {} → Delivery {}", droneId, dispatch.getId());

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

        ActiveDroneState state = new ActiveDroneState(
                droneId,
                dispatch.getId(),
                flightPath,
                drone.getCapability().getCapacity(),
                dispatch.getRequirements().getCapacity(),
                batchId,
                sequenceInBatch,
                totalInBatch
        );

        activeDrones.put(droneId, state);
        broadcastSystemState();

        logger.info("✈️ Drone {} starting flight with {} waypoints", droneId, flightPath.size());

        // Get batch tracker
        BatchTracker batchTracker = batchId != null ? activeBatchTrackers.get(droneId) : null;

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
                double progress = (double) i / flightPath.size();
                if (i >= flightPath.size() - 2) {
                    state.setStatus("DELIVERING");
                } else if (progress > 0.55 && progress < 0.95) {
                    state.setStatus("RETURNING");
                } else if (progress < 0.1) {
                    state.setStatus("DEPLOYING");
                } else {
                    state.setStatus("FLYING");
                }

                broadcastDroneUpdate(state, batchTracker);
                Thread.sleep(100);
            }

            logger.info("🎉 Drone {} completed delivery {}", droneId, dispatch.getId());

            // Update batch tracker
            if (batchTracker != null) {
                batchTracker.completedDeliveries++;

                if (batchTracker.completedDeliveries >= batchTracker.totalDeliveries) {
                    logger.info("✅ Batch {} completed all {} deliveries",
                            batchTracker.batchId, batchTracker.totalDeliveries);
                    batchToDroneMap.remove(batchTracker.batchId);
                    activeBatchTrackers.remove(droneId);

                    state.setStatus("COMPLETED");
                    broadcastDroneUpdate(state, batchTracker);
                    Thread.sleep(3000);
                }
            } else {
                state.setStatus("COMPLETED");
                broadcastDroneUpdate(state, null);
                Thread.sleep(3000);
            }

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

            double distance = calculateDistance(base, deliveryLocation);
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

    private void broadcastDroneUpdate(ActiveDroneState state, BatchTracker batchTracker) {
        DroneUpdate update = new DroneUpdate();
        update.setDroneId(state.getDroneId());
        update.setDeliveryId(state.getDeliveryId());
        update.setLatitude(state.getCurrentPosition().getLat());
        update.setLongitude(state.getCurrentPosition().getLng());
        update.setStatus(state.getStatus());
        update.setProgress((double) state.getStepIndex() / state.getFlightPath().size());
        update.setCapacityUsed(state.getCapacityUsed());
        update.setTotalCapacity(state.getTotalCapacity());

        // Add batch tracking
        if (batchTracker != null) {
            update.setBatchId(batchTracker.batchId);
            update.setCurrentDeliveryInBatch(state.getSequenceInBatch() + 1);
            update.setTotalDeliveriesInBatch(batchTracker.totalDeliveries);
        }

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

    // ============================================================================
    // Inner Classes
    // ============================================================================

    private static class BatchTracker {
        String batchId;
        int totalDeliveries;
        int completedDeliveries;

        public BatchTracker(String batchId, int totalDeliveries) {
            this.batchId = batchId;
            this.totalDeliveries = totalDeliveries;
            this.completedDeliveries = 0;
        }
    }

    public static class ActiveDroneState {
        private final String droneId;
        private final int deliveryId;
        private final List<LngLat> flightPath;
        private final double totalCapacity;
        private final double capacityUsed;
        private final String batchId;
        private final int sequenceInBatch;
        private final int totalInBatch;

        private LngLat currentPosition;
        private int stepIndex;
        private String status;

        public ActiveDroneState(String droneId, int deliveryId, List<LngLat> flightPath,
                                double totalCapacity, double capacityUsed,
                                String batchId, int sequenceInBatch, int totalInBatch) {
            this.droneId = droneId;
            this.deliveryId = deliveryId;
            this.flightPath = flightPath;
            this.totalCapacity = totalCapacity;
            this.capacityUsed = capacityUsed;
            this.batchId = batchId;
            this.sequenceInBatch = sequenceInBatch;
            this.totalInBatch = totalInBatch;
            this.currentPosition = flightPath.get(0);
            this.stepIndex = 0;
            this.status = "DEPLOYING";
        }

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
        public String getBatchId() { return batchId; }
        public int getSequenceInBatch() { return sequenceInBatch; }
        public int getTotalInBatch() { return totalInBatch; }
    }

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
        private String batchId;
        private Integer currentDeliveryInBatch;
        private Integer totalDeliveriesInBatch;

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
        public String getBatchId() { return batchId; }
        public void setBatchId(String id) { this.batchId = id; }
        public Integer getCurrentDeliveryInBatch() { return currentDeliveryInBatch; }
        public void setCurrentDeliveryInBatch(Integer n) { this.currentDeliveryInBatch = n; }
        public Integer getTotalDeliveriesInBatch() { return totalDeliveriesInBatch; }
        public void setTotalDeliveriesInBatch(Integer n) { this.totalDeliveriesInBatch = n; }
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