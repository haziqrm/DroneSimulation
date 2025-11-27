package com.example.coursework1.controllers;

import com.example.coursework1.dto.Drone;
import com.example.coursework1.service.DroneDispatchService;
import com.example.coursework1.service.DroneService;
import com.example.coursework1.service.GroqService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {

    private static final Logger logger = LoggerFactory.getLogger(ChatController.class);

    private final GroqService groqService;
    private final DroneService droneService;
    private final DroneDispatchService droneDispatchService;

    public ChatController(GroqService groqService,
                          DroneService droneService,
                          DroneDispatchService droneDispatchService) {
        this.groqService = groqService;
        this.droneService = droneService;
        this.droneDispatchService = droneDispatchService;
    }

    @PostMapping("/message")
    public ResponseEntity<Map<String, Object>> sendMessage(@RequestBody Map<String, String> request) {
        String userMessage = request.get("message");

        if (userMessage == null || userMessage.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Message cannot be empty"
            ));
        }

        logger.info("💬 Received chat message: {}", userMessage);

        try {
            // Gather COMPLETE system state with drone capabilities
            List<Drone> allDrones = droneService.fetchAllDrones();
            Map<String, DroneDispatchService.ActiveDroneState> activeDrones =
                    droneDispatchService.getActiveDrones();

            // Build comprehensive drone capability list
            List<Map<String, Object>> droneCapabilities = new ArrayList<>();
            for (Drone drone : allDrones) {
                boolean isActive = activeDrones.containsKey(drone.getId());

                Map<String, Object> droneInfo = new HashMap<>();
                droneInfo.put("id", drone.getId());
                droneInfo.put("name", drone.getName() != null ? drone.getName() : "Unnamed");
                droneInfo.put("status", isActive ? "BUSY" : "AVAILABLE");

                if (drone.getCapability() != null) {
                    droneInfo.put("capacity", drone.getCapability().getCapacity() + " kg");
                    droneInfo.put("maxMoves", drone.getCapability().getMaxMoves());
                    droneInfo.put("cooling", drone.getCapability().isCooling() ? "Yes" : "No");
                    droneInfo.put("heating", drone.getCapability().isHeating() ? "Yes" : "No");
                    droneInfo.put("costPerMove", "$" + drone.getCapability().getCostPerMove());
                }

                // Add active mission details if busy
                if (isActive) {
                    DroneDispatchService.ActiveDroneState state = activeDrones.get(drone.getId());
                    droneInfo.put("currentStatus", state.getStatus());
                    droneInfo.put("progress", (int)((double)state.getStepIndex() / state.getFlightPath().size() * 100) + "%");

                    if (state.getBatchId() != null) {
                        droneInfo.put("mission", "Batch " + state.getBatchId() + " (" +
                                state.getCurrentDeliveryIndex() + "/" + state.getTotalDeliveriesInBatch() + ")");
                    } else {
                        droneInfo.put("mission", "Delivery #" + state.getDeliveryId());
                    }
                }

                droneCapabilities.add(droneInfo);
            }

            int totalDrones = allDrones.size();
            int activeCount = activeDrones.size();
            int availableCount = totalDrones - activeCount;

            // Build context with FULL drone details
            String systemContext = groqService.buildEnhancedSystemContext(
                    totalDrones,
                    activeCount,
                    availableCount,
                    droneCapabilities
            );

            String aiResponse = groqService.chat(userMessage, systemContext);

            // CRITICAL FIX: Only send table if user is asking about drones/capabilities
            String lowerMessage = userMessage.toLowerCase();
            boolean isAskingAboutDrones =
                    lowerMessage.contains("drone") ||
                            lowerMessage.contains("fleet") ||
                            lowerMessage.contains("capacity") ||
                            lowerMessage.contains("cooling") ||
                            lowerMessage.contains("heating") ||
                            lowerMessage.contains("available") ||
                            lowerMessage.contains("show") ||
                            lowerMessage.contains("list") ||
                            lowerMessage.contains("what") && lowerMessage.contains("have");

            // Return response
            Map<String, Object> response = new HashMap<>();
            response.put("message", aiResponse);
            response.put("systemState", Map.of(
                    "totalDrones", totalDrones,
                    "activeDrones", activeCount,
                    "availableDrones", availableCount
            ));

            // Only include table if asking about drones
            if (isAskingAboutDrones) {
                response.put("droneCapabilities", droneCapabilities);
            }

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            logger.error("❌ Error processing chat message", e);
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to process message: " + e.getMessage()
            ));
        }
    }

    /**
     * NEW: Dispatch action endpoint - triggered by AI
     */
    @PostMapping("/action/dispatch")
    public ResponseEntity<Map<String, Object>> dispatchAction(@RequestBody Map<String, Object> request) {
        logger.info("🚀 AI-triggered dispatch action: {}", request);

        try {
            Double latitude = getDoubleValue(request, "latitude");
            Double longitude = getDoubleValue(request, "longitude");
            Double capacity = getDoubleValue(request, "capacity");
            Boolean cooling = (Boolean) request.getOrDefault("cooling", false);
            Boolean heating = (Boolean) request.getOrDefault("heating", false);

            if (latitude == null || longitude == null || capacity == null) {
                return ResponseEntity.ok(Map.of(
                        "success", false,
                        "message", "Missing required parameters: latitude, longitude, capacity"
                ));
            }

            // Create delivery request
            DroneDispatchService.DeliveryRequest deliveryRequest = new DroneDispatchService.DeliveryRequest();
            deliveryRequest.setLatitude(latitude);
            deliveryRequest.setLongitude(longitude);
            deliveryRequest.setCapacity(capacity);
            deliveryRequest.setCooling(cooling);
            deliveryRequest.setHeating(heating);

            // Submit delivery
            DroneDispatchService.DeliverySubmissionResult result =
                    droneDispatchService.submitDelivery(deliveryRequest);

            if (result.isSuccess()) {
                return ResponseEntity.ok(Map.of(
                        "success", true,
                        "message", "✅ Dispatched Drone " + result.getDroneId() + " for delivery #" + result.getDeliveryId(),
                        "droneId", result.getDroneId(),
                        "deliveryId", result.getDeliveryId()
                ));
            } else {
                return ResponseEntity.ok(Map.of(
                        "success", false,
                        "message", result.getMessage()
                ));
            }

        } catch (Exception e) {
            logger.error("❌ Error in AI dispatch action", e);
            return ResponseEntity.ok(Map.of(
                    "success", false,
                    "message", "Dispatch failed: " + e.getMessage()
            ));
        }
    }

    private Double getDoubleValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) return null;
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        try {
            return Double.parseDouble(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        boolean groqConfigured = System.getenv("GROQ_API_KEY") != null;

        return ResponseEntity.ok(Map.of(
                "status", groqConfigured ? "ready" : "not_configured",
                "message", groqConfigured ?
                        "Chat service ready with dispatch actions" :
                        "Set GROQ_API_KEY environment variable. Get free key at: https://console.groq.com/keys"
        ));
    }
}