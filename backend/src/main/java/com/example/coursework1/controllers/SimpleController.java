package com.example.coursework1.controllers;

import com.example.coursework1.dto.*;
import com.example.coursework1.model.Position;
import com.example.coursework1.service.*;
import com.example.coursework1.service.DroneDispatchService.DeliveryRequest;
import com.example.coursework1.service.DroneDispatchService.DeliverySubmissionResult;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.List;
import com.example.coursework1.dto.BatchDeliveryRequest;

@RestController
@RequestMapping("/api/v1")
public class SimpleController {
    private static final Logger logger = LoggerFactory.getLogger(SimpleController.class);
    private final DistanceService distanceService;
    private final NavigationService navigationService;
    private final RegionService regionService;
    private final DroneService droneService;
    private final DeliveryPlannerService deliveryPlannerService;
    private final DroneAvailabilityService droneAvailabilityService;
    private final GeoJsonService geoJsonService;

    @Autowired
    private DroneDispatchService droneDispatchService;

    public SimpleController(DistanceService distanceService,
                            NavigationService navigationService,
                            RegionService regionService,
                            DroneService droneService,
                            DeliveryPlannerService deliveryPlannerService,
                            DroneAvailabilityService droneAvailabilityService,
                            GeoJsonService geoJsonService) {
        this.distanceService = distanceService;
        this.navigationService = navigationService;
        this.regionService = regionService;
        this.droneService = droneService;
        this.deliveryPlannerService = deliveryPlannerService;
        this.droneAvailabilityService = droneAvailabilityService;
        this.geoJsonService = geoJsonService;
    }

    @GetMapping("/uid")
    public ResponseEntity<String> uid() {
        return ResponseEntity.ok("s2488749");
    }

    @PostMapping("/distanceTo")
    public ResponseEntity<Double> distanceTo(@Valid @RequestBody DistanceRequest request) {
        double distance = distanceService.calculateDistance(request);
        return ResponseEntity.ok(distance);
    }

    @PostMapping("/isCloseTo")
    public ResponseEntity<Boolean> isCloseTo(@Valid @RequestBody DistanceRequest request) {
        boolean isClose = distanceService.isClose(request);
        return ResponseEntity.ok(isClose);
    }

    @PostMapping("/nextPosition")
    public ResponseEntity<Position> nextPosition(@Valid @RequestBody NextPositionRequest request) {
        Position next = navigationService.calculateNextPosition(request);
        return ResponseEntity.ok(next);
    }

    @PostMapping("/isInRegion")
    public ResponseEntity<Boolean> isInRegion(@Valid @RequestBody RegionRequest request) {
        boolean inside = regionService.isInRegion(request);
        return ResponseEntity.ok(inside);
    }

    @GetMapping("/dronesWithCooling/{state}")
    public ResponseEntity<List<String>> dronesWithCooling(@PathVariable boolean state) {
        List<String> ids = droneService.dronesWithCooling(state);
        return ResponseEntity.ok(ids);
    }

    @GetMapping("/droneDetails/{id}")
    public ResponseEntity<?> droneDetails(@PathVariable String id) {
        Drone drone = droneService.getDroneById(id);

        if (drone == null) {
            return ResponseEntity.status(404).build();
        }

        return ResponseEntity.ok(drone);
    }

    @GetMapping("/queryAsPath/{attribute}/{value}")
    public ResponseEntity<List<String>> queryAsPath(
            @PathVariable String attribute,
            @PathVariable String value
    ) {
        return ResponseEntity.ok(droneService.queryAsPath(attribute, value));
    }

    @PostMapping("/query")
    public ResponseEntity<List<String>> query(
            @RequestBody List<QueryAttribute> filters
    ) {
        return ResponseEntity.ok(droneService.query(filters));
    }

    @PostMapping("/queryAvailableDrones")
    public ResponseEntity<List<String>> queryAvailableDrones(
            @RequestBody List<MedDispatchRec> dispatches) {
        List<String> availableDrones = droneAvailabilityService.queryAvailableDrones(dispatches);
        return ResponseEntity.ok(availableDrones);
    }

    @PostMapping("/calcDeliveryPath")
    public ResponseEntity<CalcDeliveryResult> calcDeliveryPath(
            @RequestBody List<MedDispatchRec> recs) {

        CalcDeliveryResult result = deliveryPlannerService.calcDeliveryPath(recs);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/calcDeliveryPathAsGeoJson")
    public ResponseEntity<?> calcDeliveryPathAsGeoJson(
            @RequestBody List<MedDispatchRec> recs) {

        Object geoJson = geoJsonService.calcDeliveryPathAsGeoJson(recs);
        return ResponseEntity.ok(geoJson);
    }

    @PostMapping("/submitDelivery")
    public ResponseEntity<DeliverySubmissionResult> submitDelivery(
            @RequestBody DeliveryRequest request) {

        logger.info("Received delivery submission: lat={}, lng={}, capacity={}, cooling={}, heating={}",
                request.getLatitude(), request.getLongitude(), request.getCapacity(),
                request.isCooling(), request.isHeating());

        DeliverySubmissionResult result = droneDispatchService.submitDelivery(request);

        return ResponseEntity.ok(result);
    }

    @GetMapping("/systemStatus")
    public ResponseEntity<Map<String, Object>> getSystemStatus() {
        Map<String, Object> status = Map.of(
                "activeDrones", droneDispatchService.getActiveDrones().size(),
                "totalDrones", droneService.fetchAllDrones().size(),
                "activeMissions", droneDispatchService.getActiveDrones().values().stream()
                        .map(state -> Map.of(
                                "droneId", state.getDroneId(),
                                "deliveryId", state.getDeliveryId(),
                                "status", state.getStatus(),
                                "progress", (double) state.getStepIndex() / state.getFlightPath().size()
                        ))
                        .toList()
        );

        return ResponseEntity.ok(status);
    }

    @GetMapping("/availableDrones")
    public ResponseEntity<List<Map<String, Object>>> getAvailableDrones() {
        List<Drone> allDrones = droneService.fetchAllDrones();
        Map<String, ?> activeDroneIds = droneDispatchService.getActiveDrones();

        List<Map<String, Object>> available = allDrones.stream()
                .filter(d -> !activeDroneIds.containsKey(d.getId()))
                .map(d -> Map.of(
                        "id", (Object) d.getId(),
                        "name", d.getName() != null ? d.getName() : "Unnamed",
                        "capacity", d.getCapability() != null ? d.getCapability().getCapacity() : 0.0,
                        "cooling", d.getCapability() != null && d.getCapability().isCooling(),
                        "heating", d.getCapability() != null && d.getCapability().isHeating()
                ))
                .toList();

        return ResponseEntity.ok(available);
    }

    @PostMapping("submitBatch")
    public ResponseEntity<Map<String, Object>> submitBatch(@RequestBody BatchDeliveryRequest batchRequest) {
        logger.info("Received batch submission: {}", batchRequest.getBatchId());
        logger.info("Batch contains {} deliveries", batchRequest.getDeliveries().size());

        try {
            if (batchRequest.getDeliveries() == null || batchRequest.getDeliveries().isEmpty()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Batch must contain at least one delivery");
                return ResponseEntity.ok(errorResponse);
            }

            double totalCapacity = 0;
            boolean requiresCooling = false;
            boolean requiresHeating = false;

            for (DeliveryRequest delivery : batchRequest.getDeliveries()) {
                totalCapacity += delivery.getCapacity();
                if (delivery.isCooling()) requiresCooling = true;
                if (delivery.isHeating()) requiresHeating = true;
            }

            logger.info("Batch requirements - Total: {} kg, Cooling: {}, Heating: {}",
                    totalCapacity, requiresCooling, requiresHeating);

            if (totalCapacity > 20.0) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Batch total capacity (" + totalCapacity + " kg) exceeds maximum (20 kg)");
                return ResponseEntity.ok(errorResponse);
            }

            Map<String, Object> result = droneDispatchService.submitBatch(batchRequest);

            return ResponseEntity.ok(result);

        } catch (Exception e) {
            logger.error("Error processing batch: {}", e.getMessage(), e);
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("message", "Failed to process batch: " + e.getMessage());
            return ResponseEntity.ok(errorResponse);
        }
    }
}