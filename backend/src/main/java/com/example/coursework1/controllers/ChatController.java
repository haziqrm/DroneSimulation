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
import java.util.stream.Collectors;

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
            // Gather current system state
            List<Drone> allDrones = droneService.fetchAllDrones();
            Map<String, DroneDispatchService.ActiveDroneState> activeDrones =
                    droneDispatchService.getActiveDrones();

            int totalDrones = allDrones.size();
            int activeCount = activeDrones.size();
            int availableCount = totalDrones - activeCount;

            // Build detailed active drone info
            List<String> activeDroneDetails = new ArrayList<>();
            for (Map.Entry<String, DroneDispatchService.ActiveDroneState> entry : activeDrones.entrySet()) {
                DroneDispatchService.ActiveDroneState state = entry.getValue();

                String detail;
                if (state.getBatchId() != null) {
                    detail = String.format(
                            "Drone %s: Batch %s, Status: %s, Progress: %d%%, Delivery %d/%d",
                            state.getDroneId(),
                            state.getBatchId(),
                            state.getStatus(),
                            (int) ((double) state.getStepIndex() / state.getFlightPath().size() * 100),
                            state.getCurrentDeliveryIndex(),
                            state.getTotalDeliveriesInBatch()
                    );
                } else {
                    detail = String.format(
                            "Drone %s: Delivery #%d, Status: %s, Progress: %d%%",
                            state.getDroneId(),
                            state.getDeliveryId(),
                            state.getStatus(),
                            (int) ((double) state.getStepIndex() / state.getFlightPath().size() * 100)
                    );
                }

                activeDroneDetails.add(detail);
            }

            // Recent events (could be expanded with actual event tracking)
            List<String> recentEvents = new ArrayList<>();
            if (activeCount > 0) {
                recentEvents.add(String.format("%d drone(s) currently active", activeCount));
            }
            if (availableCount == 0) {
                recentEvents.add("⚠️ All drones are currently busy");
            }

            // Build context and get AI response
            String systemContext = groqService.buildSystemContext(
                    totalDrones,
                    activeCount,
                    availableCount,
                    activeDroneDetails,
                    recentEvents
            );

            String aiResponse = groqService.chat(userMessage, systemContext);

            // Return response
            Map<String, Object> response = new HashMap<>();
            response.put("message", aiResponse);
            response.put("systemState", Map.of(
                    "totalDrones", totalDrones,
                    "activeDrones", activeCount,
                    "availableDrones", availableCount
            ));

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            logger.error("❌ Error processing chat message", e);
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to process message: " + e.getMessage()
            ));
        }
    }

    /**
     * Health check endpoint
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        boolean groqConfigured = System.getenv("GROQ_API_KEY") != null;

        return ResponseEntity.ok(Map.of(
                "status", groqConfigured ? "ready" : "not_configured",
                "message", groqConfigured ?
                        "Chat service ready" :
                        "Set GROQ_API_KEY environment variable. Get free key at: https://console.groq.com/keys"
        ));
    }
}