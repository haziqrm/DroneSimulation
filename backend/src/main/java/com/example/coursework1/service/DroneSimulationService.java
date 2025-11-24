package com.example.coursework1.service;

import com.example.coursework1.dto.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DroneSimulationService {

    private static final Logger logger = LoggerFactory.getLogger(DroneSimulationService.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final DeliveryPlannerService deliveryPlannerService;

    // Track active simulations
    private final Map<String, SimulationState> activeSimulations = new ConcurrentHashMap<>();

    public DroneSimulationService(SimpMessagingTemplate messagingTemplate,
                                  DeliveryPlannerService deliveryPlannerService) {
        this.messagingTemplate = messagingTemplate;
        this.deliveryPlannerService = deliveryPlannerService;
    }

    @Async
    public void startSimulation(String simulationId, List<MedDispatchRec> dispatches) {
        logger.info("🚀 Starting simulation {} with {} dispatches", simulationId, dispatches.size());

        // Calculate delivery paths
        CalcDeliveryResult result = deliveryPlannerService.calcDeliveryPath(dispatches);

        if (result.getDronePaths() == null || result.getDronePaths().isEmpty()) {
            logger.error("❌ No delivery paths calculated");
            return;
        }

        // Create simulation state
        SimulationState state = new SimulationState(simulationId, result);
        activeSimulations.put(simulationId, state);

        logger.info("✅ Simulation initialized with {} drones", result.getDronePaths().size());

        // Broadcast initial state
        broadcastSystemState();

        // Simulate drone movements (500ms per step)
        while (!state.isComplete()) {
            try {
                Thread.sleep(500);  // Update every 500ms

                boolean updated = state.advance();
                if (updated) {
                    List<DronePosition> positions = state.getDronePositions();
                    messagingTemplate.convertAndSend("/topic/drones", positions);

                    logger.debug("📡 Broadcast {} drone positions", positions.size());
                }

            } catch (InterruptedException e) {
                logger.warn("⚠️ Simulation interrupted");
                Thread.currentThread().interrupt();
                break;
            }
        }

        logger.info("🏁 Simulation {} completed", simulationId);
        activeSimulations.remove(simulationId);
        broadcastSystemState();
    }

    private void broadcastSystemState() {
        SystemState state = new SystemState();
        state.setActiveSimulations(activeSimulations.size());
        state.setActiveDrones(activeSimulations.values().stream()
                .mapToInt(s -> s.getDronePaths().size())
                .sum());

        messagingTemplate.convertAndSend("/topic/system", state);
    }

    public Map<String, SimulationState> getActiveSimulations() {
        return new HashMap<>(activeSimulations);
    }

    // ============================================================================
    // DTOs for WebSocket messages
    // ============================================================================

    public static class DronePosition {
        private String droneId;
        private String simulationId;
        private double lng;
        private double lat;
        private String status; // FLYING, DELIVERING, RETURNING, RETURNED
        private Integer currentDeliveryId;
        private int movesRemaining;
        private double capacityUsed;
        private List<double[]> completedPath;
        private List<double[]> remainingPath;
        private List<DeliveryPoint> deliveryPoints;

        // Getters and setters
        public String getDroneId() { return droneId; }
        public void setDroneId(String droneId) { this.droneId = droneId; }

        public String getSimulationId() { return simulationId; }
        public void setSimulationId(String id) { this.simulationId = id; }

        public double getLng() { return lng; }
        public void setLng(double lng) { this.lng = lng; }

        public double getLat() { return lat; }
        public void setLat(double lat) { this.lat = lat; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public Integer getCurrentDeliveryId() { return currentDeliveryId; }
        public void setCurrentDeliveryId(Integer id) { this.currentDeliveryId = id; }

        public int getMovesRemaining() { return movesRemaining; }
        public void setMovesRemaining(int moves) { this.movesRemaining = moves; }

        public double getCapacityUsed() { return capacityUsed; }
        public void setCapacityUsed(double capacity) { this.capacityUsed = capacity; }

        public List<double[]> getCompletedPath() { return completedPath; }
        public void setCompletedPath(List<double[]> path) { this.completedPath = path; }

        public List<double[]> getRemainingPath() { return remainingPath; }
        public void setRemainingPath(List<double[]> path) { this.remainingPath = path; }

        public List<DeliveryPoint> getDeliveryPoints() { return deliveryPoints; }
        public void setDeliveryPoints(List<DeliveryPoint> points) { this.deliveryPoints = points; }
    }

    public static class DeliveryPoint {
        private int deliveryId;
        private double lng;
        private double lat;
        private boolean completed;

        public DeliveryPoint() {}

        public DeliveryPoint(int id, double lng, double lat, boolean completed) {
            this.deliveryId = id;
            this.lng = lng;
            this.lat = lat;
            this.completed = completed;
        }

        public int getDeliveryId() { return deliveryId; }
        public void setDeliveryId(int id) { this.deliveryId = id; }

        public double getLng() { return lng; }
        public void setLng(double lng) { this.lng = lng; }

        public double getLat() { return lat; }
        public void setLat(double lat) { this.lat = lat; }

        public boolean isCompleted() { return completed; }
        public void setCompleted(boolean completed) { this.completed = completed; }
    }

    public static class SystemState {
        private int activeSimulations;
        private int activeDrones;

        public int getActiveSimulations() { return activeSimulations; }
        public void setActiveSimulations(int n) { this.activeSimulations = n; }

        public int getActiveDrones() { return activeDrones; }
        public void setActiveDrones(int n) { this.activeDrones = n; }
    }

    // ============================================================================
    // Internal simulation state
    // ============================================================================

    public static class SimulationState {
        private final String simulationId;
        private final CalcDeliveryResult result;
        private final Map<String, DroneSimState> droneStates = new HashMap<>();

        public SimulationState(String id, CalcDeliveryResult result) {
            this.simulationId = id;
            this.result = result;

            for (DronePathResult dronePath : result.getDronePaths()) {
                droneStates.put(dronePath.getDroneId(), new DroneSimState(dronePath));
            }
        }

        public boolean advance() {
            boolean anyUpdated = false;
            for (DroneSimState state : droneStates.values()) {
                if (state.advance()) anyUpdated = true;
            }
            return anyUpdated;
        }

        public boolean isComplete() {
            return droneStates.values().stream().allMatch(DroneSimState::isComplete);
        }

        public List<DronePosition> getDronePositions() {
            List<DronePosition> positions = new ArrayList<>();
            for (Map.Entry<String, DroneSimState> entry : droneStates.entrySet()) {
                DronePosition pos = new DronePosition();
                pos.setDroneId(entry.getKey());
                pos.setSimulationId(simulationId);

                DroneSimState state = entry.getValue();
                LngLat current = state.getCurrentPosition();
                pos.setLng(current.getLng());
                pos.setLat(current.getLat());
                pos.setStatus(state.getStatus());
                pos.setCurrentDeliveryId(state.getCurrentDeliveryId());
                pos.setMovesRemaining(state.getMovesRemaining());

                // Add path data
                pos.setCompletedPath(state.getCompletedPath());
                pos.setRemainingPath(state.getRemainingPath());
                pos.setDeliveryPoints(state.getDeliveryPoints());

                positions.add(pos);
            }
            return positions;
        }

        public List<DronePathResult> getDronePaths() {
            return result.getDronePaths();
        }
    }

    // ============================================================================
    // Individual drone state tracker
    // ============================================================================

    private static class DroneSimState {
        private final DronePathResult dronePath;
        private int currentDeliveryIndex = 0;
        private int currentStepIndex = 0;
        private boolean complete = false;

        public DroneSimState(DronePathResult path) {
            this.dronePath = path;
        }

        public boolean advance() {
            if (complete) return false;

            DeliveryResult currentDelivery = dronePath.getDeliveries().get(currentDeliveryIndex);
            List<LngLat> path = currentDelivery.getFlightPath();

            currentStepIndex++;

            if (currentStepIndex >= path.size()) {
                currentDeliveryIndex++;
                currentStepIndex = 0;

                if (currentDeliveryIndex >= dronePath.getDeliveries().size()) {
                    complete = true;
                }
            }

            return true;
        }

        public LngLat getCurrentPosition() {
            if (complete) {
                DeliveryResult last = dronePath.getDeliveries()
                        .get(dronePath.getDeliveries().size() - 1);
                List<LngLat> path = last.getFlightPath();
                return path.get(path.size() - 1);
            }

            DeliveryResult current = dronePath.getDeliveries().get(currentDeliveryIndex);
            return current.getFlightPath().get(currentStepIndex);
        }

        public String getStatus() {
            if (complete) return "RETURNED";

            DeliveryResult current = dronePath.getDeliveries().get(currentDeliveryIndex);
            List<LngLat> path = current.getFlightPath();

            // Check if hovering (delivering)
            if (currentStepIndex < path.size() - 1) {
                LngLat curr = path.get(currentStepIndex);
                LngLat next = path.get(currentStepIndex + 1);
                if (curr.getLng() == next.getLng() && curr.getLat() == next.getLat()) {
                    return "DELIVERING";
                }
            }

            return "FLYING";
        }

        public Integer getCurrentDeliveryId() {
            if (complete) return null;
            return dronePath.getDeliveries().get(currentDeliveryIndex).getDeliveryId();
        }

        public int getMovesRemaining() {
            int remaining = 0;
            for (int i = currentDeliveryIndex; i < dronePath.getDeliveries().size(); i++) {
                List<LngLat> path = dronePath.getDeliveries().get(i).getFlightPath();
                if (i == currentDeliveryIndex) {
                    remaining += path.size() - currentStepIndex;
                } else {
                    remaining += path.size();
                }
            }
            return remaining;
        }

        public List<double[]> getCompletedPath() {
            List<double[]> path = new ArrayList<>();

            // Add all completed deliveries
            for (int i = 0; i < currentDeliveryIndex; i++) {
                DeliveryResult delivery = dronePath.getDeliveries().get(i);
                for (LngLat point : delivery.getFlightPath()) {
                    path.add(new double[]{point.getLng(), point.getLat()});
                }
            }

            // Add current delivery up to current position
            if (!complete && currentDeliveryIndex < dronePath.getDeliveries().size()) {
                DeliveryResult current = dronePath.getDeliveries().get(currentDeliveryIndex);
                List<LngLat> flightPath = current.getFlightPath();
                for (int i = 0; i <= Math.min(currentStepIndex, flightPath.size() - 1); i++) {
                    LngLat point = flightPath.get(i);
                    path.add(new double[]{point.getLng(), point.getLat()});
                }
            }

            return path;
        }

        public List<double[]> getRemainingPath() {
            List<double[]> path = new ArrayList<>();

            if (complete) return path;

            // Add rest of current delivery
            if (currentDeliveryIndex < dronePath.getDeliveries().size()) {
                DeliveryResult current = dronePath.getDeliveries().get(currentDeliveryIndex);
                List<LngLat> flightPath = current.getFlightPath();
                for (int i = currentStepIndex; i < flightPath.size(); i++) {
                    LngLat point = flightPath.get(i);
                    path.add(new double[]{point.getLng(), point.getLat()});
                }
            }

            // Add future deliveries
            for (int i = currentDeliveryIndex + 1; i < dronePath.getDeliveries().size(); i++) {
                DeliveryResult delivery = dronePath.getDeliveries().get(i);
                for (LngLat point : delivery.getFlightPath()) {
                    path.add(new double[]{point.getLng(), point.getLat()});
                }
            }

            return path;
        }

        public List<DeliveryPoint> getDeliveryPoints() {
            List<DeliveryPoint> points = new ArrayList<>();

            for (int i = 0; i < dronePath.getDeliveries().size(); i++) {
                DeliveryResult delivery = dronePath.getDeliveries().get(i);
                List<LngLat> flightPath = delivery.getFlightPath();

                // Find the hover point (where delivery happens)
                if (!flightPath.isEmpty()) {
                    // Check for hover (two identical consecutive points)
                    LngLat deliveryLocation = null;
                    for (int j = 0; j < flightPath.size() - 1; j++) {
                        LngLat curr = flightPath.get(j);
                        LngLat next = flightPath.get(j + 1);
                        if (curr.getLng() == next.getLng() && curr.getLat() == next.getLat()) {
                            deliveryLocation = curr;
                            break;
                        }
                    }

                    // If no hover found, use middle of path
                    if (deliveryLocation == null && flightPath.size() > 2) {
                        deliveryLocation = flightPath.get(flightPath.size() / 3);
                    }

                    if (deliveryLocation != null) {
                        boolean isCompleted = i < currentDeliveryIndex;
                        points.add(new DeliveryPoint(
                                delivery.getDeliveryId(),
                                deliveryLocation.getLng(),
                                deliveryLocation.getLat(),
                                isCompleted
                        ));
                    }
                }
            }

            return points;
        }

        public boolean isComplete() {
            return complete;
        }
    }
}