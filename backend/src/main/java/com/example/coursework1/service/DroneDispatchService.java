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

    private static final Map<String, ActiveDroneState> activeDrones = new ConcurrentHashMap<>();
    private static final AtomicInteger deliveryIdCounter = new AtomicInteger(1000);
    private static final Map<String, BatchData> activeBatches = new ConcurrentHashMap<>();

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

    public Map<String, Object> submitBatch(BatchDeliveryRequest batchRequest) {
        logger.info("📦 Processing batch: {} with {} deliveries", 
                batchRequest.getBatchId(), batchRequest.getDeliveries().size());

        // CRITICAL: Check drone availability FIRST
        List<Drone> allDrones = droneService.fetchAllDrones();
        int totalDrones = allDrones.size();
        int busyDrones = activeDrones.size();
        int availableDrones = totalDrones - busyDrones;
        
        logger.info("🚁 Drone status: {} total, {} busy, {} available", 
                totalDrones, busyDrones, availableDrones);
        
        if (busyDrones > 0) {
            logger.info("🔒 Busy drones: {}", activeDrones.keySet());
        }

        if (availableDrones == 0) {
            logger.error("❌ No drones available for batch {} - all {} drones are busy", 
                    batchRequest.getBatchId(), totalDrones);
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", "All drones are currently busy. Please wait for a drone to complete its delivery.");
            response.put("totalDrones", totalDrones);
            response.put("busyDrones", busyDrones);
            response.put("busyDroneIds", new ArrayList<>(activeDrones.keySet()));
            return response;
        }

        // Convert all deliveries to MedDispatchRec (just like the GeoJSON endpoint)
        List<MedDispatchRec> allDispatches = new ArrayList<>();
        for (DeliveryRequest delivery : batchRequest.getDeliveries()) {
            int deliveryId = deliveryIdCounter.getAndIncrement();
            MedDispatchRec dispatch = new MedDispatchRec(
                    deliveryId,
                    "2025-11-11", // Use the same date as your test case or pass from frontend
                    "10:00",      // Use the same time as your test case or pass from frontend
                    new Requirements(delivery.getCapacity(), delivery.isCooling(),
                            delivery.isHeating(), null),
                    new Position(delivery.getLongitude(), delivery.getLatitude())
            );
            allDispatches.add(dispatch);
        }

        // Use the exact same logic as calcDeliveryPathAsGeoJson
        logger.info("🔍 Planning delivery path for {} dispatches...", allDispatches.size());
        CalcDeliveryResult result = plannerService.calcDeliveryPath(allDispatches);

        Map<String, Object> response = new HashMap<>();
        if (result.getDronePaths() == null || result.getDronePaths().isEmpty()) {
            logger.error("❌ Pathfinding failed for batch {}", batchRequest.getBatchId());
            response.put("success", false);
            response.put("message", "Pathfinding failed for batch");
            return response;
        }
        
        // Log which drones the planner selected
        logger.info("📋 Planner selected {} drone(s) for batch:", result.getDronePaths().size());
        for (DronePathResult pathResult : result.getDronePaths()) {
            logger.info("   → Drone {} assigned {} deliveries", 
                    pathResult.getDroneId(), pathResult.getDeliveries().size());
        }

        // Get base
        List<ServicePoint> servicePoints = servicePointService.fetchAllServicePoints();
        Position base = servicePoints.isEmpty() ?
                new Position(-3.1892, 55.9445) :
                new Position(servicePoints.get(0).getLocation().getLng(),
                        servicePoints.get(0).getLocation().getLat());

        // Track successfully dispatched drones
        int dispatchedDrones = 0;
        List<String> skippedDrones = new ArrayList<>();
        
        // For each drone in the plan, start a mission with the planned deliveries
        for (DronePathResult pathResult : result.getDronePaths()) {
            String plannedDroneId = pathResult.getDroneId();
            Drone drone = droneService.getDroneById(plannedDroneId);
            
            if (drone == null) {
                logger.error("❌ Planned drone {} not found", plannedDroneId);
                skippedDrones.add(plannedDroneId + " (not found)");
                continue;
            }
            
            // Find the MedDispatchRec objects for this drone's deliveries FIRST
            List<MedDispatchRec> droneDispatches = new ArrayList<>();
            for (DeliveryResult dr : pathResult.getDeliveries()) {
                for (MedDispatchRec rec : allDispatches) {
                    if (rec.getId().equals(dr.getDeliveryId())) {
                        droneDispatches.add(rec);
                        break;
                    }
                }
            }
            
            // Check if planned drone is already active - if so, find alternative
            if (activeDrones.containsKey(drone.getId())) {
                logger.warn("⚠️ Planned drone {} is BUSY - searching for alternative...", drone.getId());
                
                Drone alternativeDrone = findAlternativeDrone(
                        allDrones, 
                        drone.getCapability(), 
                        droneDispatches
                );
                
                if (alternativeDrone != null) {
                    logger.info("✅ Found alternative: Drone {} will replace busy Drone {}", 
                            alternativeDrone.getId(), plannedDroneId);
                    drone = alternativeDrone; // Use alternative instead
                } else {
                    logger.error("❌ No alternative drone available (planned: {})", plannedDroneId);
                    skippedDrones.add(plannedDroneId + " (busy, no alternatives available)");
                    continue;
                }
            } else {
                logger.info("✅ Using planned drone {} (available)", drone.getId());
            }
            
            // Mark drone as unavailable IMMEDIATELY
            ActiveDroneState placeholderState = new ActiveDroneState(
                    drone.getId(),
                    -1,
                    List.of(new LngLat(base.getLng(), base.getLat())),
                    drone.getCapability().getCapacity(),
                    0,
                    batchRequest.getBatchId(),
                    droneDispatches.size()
            );
            placeholderState.setStatus("PENDING");
            activeDrones.put(drone.getId(), placeholderState);
            logger.info("🔒 Drone {} marked as unavailable for batch {}", drone.getId(), batchRequest.getBatchId());
            
            // Use the planned order and path
            startBatchMission(drone, droneDispatches, base, batchRequest.getBatchId());
            dispatchedDrones++;
        }

        // Check if we successfully dispatched any drones
        if (dispatchedDrones == 0) {
            logger.error("❌ Failed to dispatch any drones for batch {}. Skipped: {}", 
                    batchRequest.getBatchId(), skippedDrones);
            response.put("success", false);
            response.put("message", "No drones available. All drones are currently busy. Skipped: " + skippedDrones);
            response.put("skippedDrones", skippedDrones);
            return response;
        }

        logger.info("✅ Successfully dispatched {} drone(s) for batch {}", dispatchedDrones, batchRequest.getBatchId());
        if (!skippedDrones.isEmpty()) {
            logger.warn("⚠️ Skipped {} drone(s): {}", skippedDrones.size(), skippedDrones);
        }

        response.put("success", true);
        response.put("batchId", batchRequest.getBatchId());
        response.put("deliveryCount", allDispatches.size());
        response.put("dispatchedDrones", dispatchedDrones);
        if (!skippedDrones.isEmpty()) {
            response.put("skippedDrones", skippedDrones);
        }
        broadcastSystemState();
        return response;
    }

    /**
     * Submit a single delivery
     */
    public DeliverySubmissionResult submitDelivery(DeliveryRequest request) {
        logger.info("📦 New single delivery request: capacity={}, cooling={}, heating={}, location=({}, {})",
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

        List<ServicePoint> servicePoints = servicePointService.fetchAllServicePoints();
        Position base = servicePoints.isEmpty() ?
                new Position(-3.1892, 55.9445) :
                new Position(servicePoints.get(0).getLocation().getLng(),
                        servicePoints.get(0).getLocation().getLat());

        // Find available drones
        List<Drone> allDrones = droneService.fetchAllDrones();
        Requirements reqs = dispatch.getRequirements();

        List<Drone> availableDrones = allDrones.stream()
                .filter(drone -> !activeDrones.containsKey(drone.getId()))
                .filter(drone -> {
                    Capability cap = drone.getCapability();
                    if (cap == null) return false;
                    if (cap.getCapacity() < reqs.getCapacity() - 0.01) return false;
                    if (reqs.isCooling() && !cap.isCooling()) return false;
                    if (reqs.isHeating() && !cap.isHeating()) return false;
                    return true;
                })
                .toList();

        if (availableDrones.isEmpty()) {
            logger.error("❌ No available drones for delivery {}", deliveryId);
            return new DeliverySubmissionResult(false, deliveryId, null, "No drones match requirements");
        }

        Drone selectedDrone = selectBestDrone(availableDrones, dispatch.getDelivery(), base);

        if (selectedDrone == null) {
            logger.error("❌ Failed to select drone");
            return new DeliverySubmissionResult(false, deliveryId, null, "Drone selection failed");
        }

        logger.info("✅ Selected drone {} for delivery {}", selectedDrone.getId(), deliveryId);

        // CRITICAL FIX: Mark drone as unavailable IMMEDIATELY to prevent race conditions
        // Create a placeholder state that will be replaced when mission actually starts
        ActiveDroneState placeholderState = new ActiveDroneState(
                selectedDrone.getId(),
                deliveryId,
                List.of(new LngLat(base.getLng(), base.getLat())), // Placeholder path
                selectedDrone.getCapability().getCapacity(),
                dispatch.getRequirements().getCapacity(),
                null,
                1
        );
        placeholderState.setStatus("PENDING");
        activeDrones.put(selectedDrone.getId(), placeholderState);
        logger.info("🔒 Drone {} marked as unavailable (PENDING)", selectedDrone.getId());
        
        // Broadcast system state immediately so frontend knows drone is taken
        broadcastSystemState();

        // Start single delivery mission (async - will replace placeholder state)
        startSingleDeliveryMission(selectedDrone, dispatch, base);

        return new DeliverySubmissionResult(
                true,
                deliveryId,
                selectedDrone.getId(),
                "Drone dispatched successfully"
        );
    }

    /**
     * Start batch mission - ALL deliveries chained together
     */
    @Async
    public void startBatchMission(Drone drone, List<MedDispatchRec> allDispatches, 
                                  Position base, String batchId) {
        String droneId = drone.getId();
        logger.info("🚁 Starting BATCH mission: Drone {} → {} deliveries in ONE flight", 
                droneId, allDispatches.size());

        try {
            // Plan ALL deliveries together - this chains them!
            CalcDeliveryResult result = plannerService.calcDeliveryPath(allDispatches);

            if (result.getDronePaths() == null || result.getDronePaths().isEmpty()) {
                logger.error("❌ Pathfinding failed for batch {}", batchId);
                activeDrones.remove(droneId);
                broadcastSystemState();
                broadcastBatchFailed(batchId, droneId, "Pathfinding failed");
                return;
            }

            DronePathResult pathResult = result.getDronePaths().get(0);
            List<DeliveryResult> deliveryResults = pathResult.getDeliveries();

            if (deliveryResults.isEmpty()) {
                logger.error("❌ No delivery paths for batch {}", batchId);
                activeDrones.remove(droneId);
                broadcastSystemState();
                broadcastBatchFailed(batchId, droneId, "No valid paths");
                return;
            }

            // Build complete flight path by chaining all delivery paths
            List<LngLat> completePath = new ArrayList<>();
            for (int i = 0; i < deliveryResults.size(); i++) {
                List<LngLat> deliveryPath = deliveryResults.get(i).getFlightPath();
                if (i == 0) {
                    completePath.addAll(deliveryPath);
                } else {
                    // Skip first point (duplicate of last point from previous delivery)
                    completePath.addAll(deliveryPath.subList(1, deliveryPath.size()));
                }
            }

            logger.info("✈️ Batch {} flight path: {} waypoints for {} deliveries", 
                    batchId, completePath.size(), deliveryResults.size());

            ActiveDroneState state = new ActiveDroneState(
                    droneId,
                    -1, // No single delivery ID for batch
                    completePath,
                    drone.getCapability().getCapacity(),
                    0, // Will be updated
                    batchId,
                    allDispatches.size()
            );

            activeDrones.put(droneId, state);
            broadcastSystemState();

            for (int i = 0; i < completePath.size(); i++) {
                if (!activeDrones.containsKey(droneId)) {
                    logger.warn("⚠️ Drone {} mission cancelled", droneId);
                    break;
                }

                LngLat position = completePath.get(i);
                state.setCurrentPosition(position);
                state.setStepIndex(i);

                // Determine status and which delivery we're on
                double progress = (double) i / completePath.size();
                int currentDeliveryIdx = 0;
                int accumulatedSteps = 0;

                for (int d = 0; d < deliveryResults.size(); d++) {
                    int stepsForThisDelivery = deliveryResults.get(d).getFlightPath().size();
                    if (accumulatedSteps + stepsForThisDelivery > i) {
                        currentDeliveryIdx = d;
                        break;
                    }
                    accumulatedSteps += stepsForThisDelivery - 1; // -1 to avoid double-counting
                }

                state.setCurrentDeliveryIndex(currentDeliveryIdx);

                if (progress < 0.1) {
                    state.setStatus("DEPLOYING");
                } else if (progress < 0.2) {
                    state.setStatus("FLYING");
                } else if (progress < 0.95) {
                    state.setStatus("DELIVERING");
                } else {
                    state.setStatus("RETURNING");
                }

                broadcastBatchUpdate(state);
                Thread.sleep(100);
            }

            logger.info("🎉 Batch {} completed all {} deliveries", batchId, allDispatches.size());

            state.setStatus("COMPLETED");
            broadcastBatchUpdate(state);
            Thread.sleep(3000);

            activeDrones.remove(droneId);
            activeBatches.remove(batchId);
            broadcastSystemState();
            broadcastBatchCompleted(batchId, droneId);

        } catch (InterruptedException e) {
            logger.warn("⚠️ Batch {} mission interrupted", batchId);
            Thread.currentThread().interrupt();
            activeDrones.remove(droneId);
            activeBatches.remove(batchId);
            broadcastSystemState();
        } catch (Exception e) {
            logger.error("❌ Batch {} mission failed with exception", batchId, e);
            activeDrones.remove(droneId);
            activeBatches.remove(batchId);
            broadcastSystemState();
            broadcastBatchFailed(batchId, droneId, "Mission failed: " + e.getMessage());
        }
    }

    /**
     * Start single delivery mission
     */
    @Async
    public void startSingleDeliveryMission(Drone drone, MedDispatchRec dispatch, Position base) {
        String droneId = drone.getId();
        int deliveryId = dispatch.getId();
        
        logger.info("🚁 Starting SINGLE delivery mission: Drone {} → Delivery {}", droneId, deliveryId);

        try {
            CalcDeliveryResult result = plannerService.calcDeliveryPath(List.of(dispatch));

            if (result.getDronePaths() == null || result.getDronePaths().isEmpty()) {
                logger.error("❌ Pathfinding failed for delivery {}", deliveryId);
                activeDrones.remove(droneId);
                broadcastSystemState();
                broadcastDeliveryFailed(droneId, deliveryId, "Pathfinding failed");
                return;
            }

            DronePathResult pathResult = result.getDronePaths().get(0);
            if (pathResult.getDeliveries().isEmpty()) {
                logger.error("❌ No delivery path for delivery {}", deliveryId);
                activeDrones.remove(droneId);
                broadcastSystemState();
                broadcastDeliveryFailed(droneId, deliveryId, "No valid path");
                return;
            }

            List<LngLat> flightPath = pathResult.getDeliveries().get(0).getFlightPath();

            ActiveDroneState state = new ActiveDroneState(
                    droneId,
                    deliveryId,
                    flightPath,
                    drone.getCapability().getCapacity(),
                    dispatch.getRequirements().getCapacity(),
                    null,
                    1
            );

            activeDrones.put(droneId, state);
            broadcastSystemState();

            logger.info("✈️ Drone {} starting flight with {} waypoints", droneId, flightPath.size());

            for (int i = 0; i < flightPath.size(); i++) {
                if (!activeDrones.containsKey(droneId)) {
                    logger.warn("⚠️ Drone {} mission cancelled", droneId);
                    break;
                }

                LngLat position = flightPath.get(i);
                state.setCurrentPosition(position);
                state.setStepIndex(i);

                double progress = (double) i / flightPath.size();
                if (i >= flightPath.size() - 2) {
                    state.setStatus("DELIVERING");
                } else if (progress > 0.55) {
                    state.setStatus("RETURNING");
                } else if (progress < 0.1) {
                    state.setStatus("DEPLOYING");
                } else {
                    state.setStatus("FLYING");
                }

                broadcastSingleUpdate(state);
                Thread.sleep(100);
            }

            logger.info("🎉 Drone {} completed delivery {}", droneId, deliveryId);

            state.setStatus("COMPLETED");
            broadcastSingleUpdate(state);
            Thread.sleep(3000);

            activeDrones.remove(droneId);
            broadcastSystemState();
            broadcastDeliveryCompleted(droneId, deliveryId);

        } catch (InterruptedException e) {
            logger.warn("⚠️ Drone {} mission interrupted", droneId);
            Thread.currentThread().interrupt();
            activeDrones.remove(droneId);
            broadcastSystemState();
        } catch (Exception e) {
            logger.error("❌ Drone {} mission failed with exception", droneId, e);
            activeDrones.remove(droneId);
            broadcastSystemState();
            broadcastDeliveryFailed(droneId, deliveryId, "Mission failed: " + e.getMessage());
        }
    }

    private Drone selectBestDrone(List<Drone> availableDrones, Position deliveryLocation, Position base) {
        if (availableDrones.isEmpty()) return null;

        Drone bestDrone = null;
        double bestScore = Double.POSITIVE_INFINITY;

        for (Drone drone : availableDrones) {
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

    /**
     * Find an alternative drone with same/better capabilities that's not busy
     */
    private Drone findAlternativeDrone(List<Drone> allDrones, Capability requiredCapability, 
                                        List<MedDispatchRec> dispatches) {
        if (requiredCapability == null || dispatches == null || dispatches.isEmpty()) {
            return null;
        }

        // Calculate total requirements from all dispatches
        double totalCapacityNeeded = dispatches.stream()
                .mapToDouble(d -> d.getRequirements().getCapacity())
                .sum();
        
        boolean needsCooling = dispatches.stream()
                .anyMatch(d -> d.getRequirements().isCooling());
        
        boolean needsHeating = dispatches.stream()
                .anyMatch(d -> d.getRequirements().isHeating());

        logger.info("🔍 Looking for drone with: capacity >= {}, cooling={}, heating={}", 
                totalCapacityNeeded, needsCooling, needsHeating);

        // Find available drones with matching capabilities
        List<Drone> candidates = allDrones.stream()
                .filter(drone -> !activeDrones.containsKey(drone.getId())) // Not busy
                .filter(drone -> {
                    Capability cap = drone.getCapability();
                    if (cap == null) return false;
                    if (cap.getCapacity() < totalCapacityNeeded - 0.01) return false;
                    if (needsCooling && !cap.isCooling()) return false;
                    if (needsHeating && !cap.isHeating()) return false;
                    return true;
                })
                .sorted(Comparator.comparingDouble((Drone d) -> {
                    // Sort by capacity (prefer closest match) and cost
                    double capacityDiff = Math.abs(d.getCapability().getCapacity() - totalCapacityNeeded);
                    double costFactor = d.getCapability().getCostPerMove() * 100;
                    return capacityDiff + costFactor;
                }))
                .toList();

        if (!candidates.isEmpty()) {
            Drone alternative = candidates.get(0);
            logger.info("✅ Found alternative drone: {} (capacity: {}, cooling: {}, heating: {})",
                    alternative.getId(),
                    alternative.getCapability().getCapacity(),
                    alternative.getCapability().isCooling(),
                    alternative.getCapability().isHeating());
            return alternative;
        }

        logger.warn("❌ No alternative drones available with required capabilities");
        return null;
    }

    private double calculateDistance(Position a, Position b) {
        double dx = a.getLng() - b.getLng();
        double dy = a.getLat() - b.getLat();
        return Math.sqrt(dx * dx + dy * dy);
    }

    private void broadcastBatchUpdate(ActiveDroneState state) {
        DroneUpdate update = new DroneUpdate();
        update.setDroneId(state.getDroneId());
        update.setDeliveryId(state.getDeliveryId());
        update.setLatitude(state.getCurrentPosition().getLat());
        update.setLongitude(state.getCurrentPosition().getLng());
        update.setStatus(state.getStatus());
        update.setProgress((double) state.getStepIndex() / state.getFlightPath().size());
        update.setCapacityUsed(0);
        update.setTotalCapacity(state.getTotalCapacity());
        update.setBatchId(state.getBatchId());
        update.setCurrentDeliveryInBatch(state.getCurrentDeliveryIndex() + 1);
        update.setTotalDeliveriesInBatch(state.getTotalDeliveriesInBatch());

        // Include full route on first update
        if (state.getStepIndex() == 0) {
            List<List<Double>> route = state.getFlightPath().stream()
                    .map(point -> List.of(point.getLat(), point.getLng()))
                    .toList();
            update.setRoute(route);
            
            // Find delivery point (hover point - where two consecutive points are the same)
            LngLat deliveryPoint = findDeliveryPoint(state.getFlightPath());
            if (deliveryPoint != null) {
                update.setDeliveryLatitude(deliveryPoint.getLat());
                update.setDeliveryLongitude(deliveryPoint.getLng());
                logger.info("🎯 Batch: Sending delivery coords for drone {}: ({}, {})", 
                    state.getDroneId(), deliveryPoint.getLat(), deliveryPoint.getLng());
            } else {
                logger.error("❌ Batch: No delivery point found for drone {}", state.getDroneId());
            }
        }

        messagingTemplate.convertAndSend("/topic/drone-updates", update);
    }
    
    private LngLat findDeliveryPoint(List<LngLat> flightPath) {
        // Find hover point (two consecutive identical points)
        for (int i = 0; i < flightPath.size() - 1; i++) {
            LngLat curr = flightPath.get(i);
            LngLat next = flightPath.get(i + 1);
            double latDiff = Math.abs(curr.getLat() - next.getLat());
            double lngDiff = Math.abs(curr.getLng() - next.getLng());
            
            // Hover threshold - must be within 0.00015 degrees (same as ILP close distance)
            if (latDiff < 0.00015 && lngDiff < 0.00015) {
                logger.info("✅ Found hover point at index {}: ({}, {})", i, curr.getLat(), curr.getLng());
                return curr;
            }
        }
        
        // If no hover found, use point about 40% through the path (before return journey)
        int deliveryIndex = Math.max(0, Math.min(flightPath.size() - 1, (flightPath.size() * 2) / 5));
        LngLat fallbackPoint = flightPath.get(deliveryIndex);
        logger.warn("⚠️ No hover point found in path of {} points, using fallback index {}: ({}, {})", 
            flightPath.size(), deliveryIndex, fallbackPoint.getLat(), fallbackPoint.getLng());
        return fallbackPoint;
    }

    private void broadcastSingleUpdate(ActiveDroneState state) {
        DroneUpdate update = new DroneUpdate();
        update.setDroneId(state.getDroneId());
        update.setDeliveryId(state.getDeliveryId());
        update.setLatitude(state.getCurrentPosition().getLat());
        update.setLongitude(state.getCurrentPosition().getLng());
        update.setStatus(state.getStatus());
        update.setProgress((double) state.getStepIndex() / state.getFlightPath().size());
        update.setCapacityUsed(state.getCapacityUsed());
        update.setTotalCapacity(state.getTotalCapacity());

        // Include full route on first update
        if (state.getStepIndex() == 0) {
            List<List<Double>> route = state.getFlightPath().stream()
                    .map(point -> List.of(point.getLat(), point.getLng()))
                    .toList();
            update.setRoute(route);
            
            // Find delivery point (hover point - where two consecutive points are the same)
            LngLat deliveryPoint = findDeliveryPoint(state.getFlightPath());
            if (deliveryPoint != null) {
                update.setDeliveryLatitude(deliveryPoint.getLat());
                update.setDeliveryLongitude(deliveryPoint.getLng());
                logger.info("🎯 Single: Sending delivery coords for drone {}: ({}, {})", 
                    state.getDroneId(), deliveryPoint.getLat(), deliveryPoint.getLng());
            } else {
                logger.error("❌ Single: No delivery point found for drone {}", state.getDroneId());
            }
        }

        messagingTemplate.convertAndSend("/topic/drone-updates", update);
    }

    private void broadcastSystemState() {
        SystemStateUpdate state = new SystemStateUpdate();
        state.setActiveDrones(activeDrones.size());
        state.setAvailableDrones(countAvailableDrones());
        messagingTemplate.convertAndSend("/topic/system-state", state);
    }

    private void broadcastBatchCompleted(String batchId, String droneId) {
        DeliveryStatusUpdate update = new DeliveryStatusUpdate();
        update.setStatus("COMPLETED");
        update.setDroneId(droneId);
        update.setMessage("✅ Batch " + batchId + " completed successfully!");
        messagingTemplate.convertAndSend("/topic/delivery-status", update);
    }

    private void broadcastBatchFailed(String batchId, String droneId, String reason) {
        DeliveryStatusUpdate update = new DeliveryStatusUpdate();
        update.setStatus("FAILED");
        update.setDroneId(droneId);
        update.setMessage("❌ Batch " + batchId + " failed: " + reason);
        messagingTemplate.convertAndSend("/topic/delivery-status", update);
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

    private static class BatchData {
        String batchId;
        String droneId;
        int totalDeliveries;

        public BatchData(String batchId, String droneId, int totalDeliveries) {
            this.batchId = batchId;
            this.droneId = droneId;
            this.totalDeliveries = totalDeliveries;
        }
    }

    public static class ActiveDroneState {
        private final String droneId;
        private final int deliveryId;
        private final List<LngLat> flightPath;
        private final double totalCapacity;
        private final double capacityUsed;
        private final String batchId;
        private final int totalDeliveriesInBatch;

        private LngLat currentPosition;
        private int stepIndex;
        private String status;
        private int currentDeliveryIndex;

        public ActiveDroneState(String droneId, int deliveryId, List<LngLat> flightPath,
                                double totalCapacity, double capacityUsed,
                                String batchId, int totalDeliveriesInBatch) {
            this.droneId = droneId;
            this.deliveryId = deliveryId;
            this.flightPath = flightPath;
            this.totalCapacity = totalCapacity;
            this.capacityUsed = capacityUsed;
            this.batchId = batchId;
            this.totalDeliveriesInBatch = totalDeliveriesInBatch;
            this.currentPosition = flightPath.get(0);
            this.stepIndex = 0;
            this.status = "DEPLOYING";
            this.currentDeliveryIndex = 0;
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
        public int getTotalDeliveriesInBatch() { return totalDeliveriesInBatch; }
        public int getCurrentDeliveryIndex() { return currentDeliveryIndex; }
        public void setCurrentDeliveryIndex(int idx) { this.currentDeliveryIndex = idx; }
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
        private List<List<Double>> route; // Full flight path
        private Double deliveryLatitude;
        private Double deliveryLongitude;

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
        public List<List<Double>> getRoute() { return route; }
        public void setRoute(List<List<Double>> route) { this.route = route; }
        public Double getDeliveryLatitude() { return deliveryLatitude; }
        public void setDeliveryLatitude(Double lat) { this.deliveryLatitude = lat; }
        public Double getDeliveryLongitude() { return deliveryLongitude; }
        public void setDeliveryLongitude(Double lng) { this.deliveryLongitude = lng; }
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