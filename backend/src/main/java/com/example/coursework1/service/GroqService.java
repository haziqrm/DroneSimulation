package com.example.coursework1.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Service
public class GroqService {

    private static final Logger logger = LoggerFactory.getLogger(GroqService.class);
    private static final String GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
    private static final String MODEL = "llama-3.3-70b-versatile";

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    @Value("${GROQ_API_KEY:}")  // ← CHANGED: Use @Value instead of System.getenv
    private String apiKey;

    public GroqService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        // WebClient initialization moved to @PostConstruct
        this.webClient = null;
    }

    @jakarta.annotation.PostConstruct
    public void init() {
        if (this.apiKey == null || this.apiKey.isEmpty()) {
            logger.warn("⚠️ GROQ_API_KEY not set! Get free key at: https://console.groq.com/keys");
        } else {
            logger.info("✅ GROQ_API_KEY loaded successfully");
        }
    }

    private WebClient getWebClient() {
        if (webClient != null) return webClient;

        return WebClient.builder()
                .baseUrl(GROQ_API_URL)
                .defaultHeader("Authorization", "Bearer " + (apiKey != null ? apiKey : ""))
                .defaultHeader("Content-Type", "application/json")
                .build();
    }

    public String chat(String userMessage, String systemContext) {
        if (apiKey == null || apiKey.isEmpty()) {
            return "❌ Groq API key not configured. Set GROQ_API_KEY environment variable.";
        }

        try {
            logger.info("💬 Sending message to Groq: {}", userMessage);

            Map<String, Object> requestBody = Map.of(
                    "model", MODEL,
                    "messages", List.of(
                            Map.of("role", "system", "content", systemContext),
                            Map.of("role", "user", "content", userMessage)
                    ),
                    "temperature", 0.7,
                    "max_tokens", 500,
                    "top_p", 1,
                    "stream", false
            );

            String response = getWebClient().post()
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            logger.debug("Groq response: {}", response);

            JsonNode root = objectMapper.readTree(response);
            JsonNode choices = root.get("choices");

            if (choices != null && choices.isArray() && choices.size() > 0) {
                JsonNode message = choices.get(0).get("message");
                if (message != null) {
                    String content = message.get("content").asText();
                    logger.info("✅ Groq reply: {}", content);
                    return content;
                }
            }

            logger.warn("Unexpected response format from Groq");
            return "Sorry, I couldn't process that response.";

        } catch (Exception e) {
            logger.error("Error calling Groq API", e);
            return "Error: " + e.getMessage();
        }
    }

    public String buildSystemContext(
            int totalDrones,
            int activeDrones,
            int availableDrones,
            List<String> activeDroneDetails,
            List<String> recentEvents
    ) {
        StringBuilder context = new StringBuilder();

        context.append("You are an AI assistant for a real-time drone delivery system in Edinburgh, Scotland.\n\n");

        context.append("CURRENT SYSTEM STATE:\n");
        context.append(String.format("- Total drones in fleet: %d\n", totalDrones));
        context.append(String.format("- Active deliveries: %d\n", activeDrones));
        context.append(String.format("- Available drones: %d\n", availableDrones));
        context.append("\n");

        if (!activeDroneDetails.isEmpty()) {
            context.append("ACTIVE DRONES:\n");
            for (String detail : activeDroneDetails) {
                context.append("- ").append(detail).append("\n");
            }
            context.append("\n");
        }

        if (!recentEvents.isEmpty()) {
            context.append("RECENT EVENTS:\n");
            for (String event : recentEvents) {
                context.append("- ").append(event).append("\n");
            }
            context.append("\n");
        }

        context.append("OPERATIONAL KNOWLEDGE:\n");
        context.append("- Drones navigate around restricted areas (George Square, Bristo Square, etc.)\n");
        context.append("- Each drone has capacity limits (4kg, 8kg, 12kg, or 20kg)\n");
        context.append("- Some drones have cooling/heating capabilities\n");
        context.append("- Maximum moves per drone varies (750-2000 moves)\n");
        context.append("- Batch deliveries can have multiple stops in sequence\n");
        context.append("- Drones return to base after completing deliveries\n");
        context.append("\n");

        context.append("YOUR ROLE:\n");
        context.append("- Answer questions about drone operations clearly and concisely\n");
        context.append("- Explain why drones behave certain ways (delays, routes, etc.)\n");
        context.append("- Provide insights about delivery efficiency\n");
        context.append("- Suggest optimizations when appropriate\n");
        context.append("- Be friendly and helpful\n");
        context.append("\n");

        context.append("RESPONSE STYLE:\n");
        context.append("- Keep responses under 3 sentences when possible\n");
        context.append("- Use specific data from the context\n");
        context.append("- Be professional but conversational\n");

        return context.toString();
    }

    // ADD THIS METHOD TO GroqService.java

    public String buildEnhancedSystemContext(
            int totalDrones,
            int activeDrones,
            int availableDrones,
            List<Map<String, Object>> droneCapabilities
    ) {
        StringBuilder context = new StringBuilder();

        context.append("You are an AI assistant for a real-time drone delivery system in Edinburgh, Scotland.\n\n");

        context.append("CURRENT SYSTEM STATE:\n");
        context.append(String.format("- Total drones in fleet: %d\n", totalDrones));
        context.append(String.format("- Active deliveries: %d\n", activeDrones));
        context.append(String.format("- Available drones: %d\n\n", availableDrones));

        context.append("COMPLETE DRONE FLEET CAPABILITIES:\n");
        for (Map<String, Object> drone : droneCapabilities) {
            context.append(String.format("- Drone %s (%s)\n",
                    drone.get("id"),
                    drone.get("status")));
            context.append(String.format("  • Capacity: %s\n", drone.get("capacity")));
            context.append(String.format("  • Max Moves: %s\n", drone.get("maxMoves")));
            context.append(String.format("  • Cooling: %s\n", drone.get("cooling")));
            context.append(String.format("  • Heating: %s\n", drone.get("heating")));
            context.append(String.format("  • Cost/Move: %s\n", drone.get("costPerMove")));

            if ("BUSY".equals(drone.get("status"))) {
                context.append(String.format("  • Current Mission: %s\n", drone.get("mission")));
                context.append(String.format("  • Progress: %s\n", drone.get("progress")));
            }
            context.append("\n");
        }

        context.append("YOUR CAPABILITIES:\n");
        context.append("You can provide detailed information about:\n");
        context.append("- Exact drone specifications (capacity, range, special features)\n");
        context.append("- Which drones are best for specific delivery requirements\n");
        context.append("- Cost estimates for deliveries\n");
        context.append("- Why certain drones are chosen for specific jobs\n");
        context.append("- Current operational status and bottlenecks\n\n");

        context.append("ACTIONABLE RESPONSES:\n");
        context.append("When users ask you to dispatch a drone or create a delivery, respond with:\n");
        context.append("'I can help with that! To dispatch a drone, I'll need:\n");
        context.append("- Delivery coordinates (latitude, longitude)\n");
        context.append("- Package weight in kg\n");
        context.append("- Any special requirements (cooling/heating)'\n\n");
        context.append("Then tell them to use the delivery form on the left sidebar.\n\n");

        context.append("RESPONSE STYLE:\n");
        context.append("- Be specific with drone capabilities when asked\n");
        context.append("- Use actual data from the fleet (capacity, costs, features)\n");
        context.append("- Explain tradeoffs (e.g., larger capacity vs. cost)\n");
        context.append("- Keep responses clear and actionable\n");
        context.append("- If asked about capabilities, list specific drones with their specs\n");
        context.append("- For general questions, be concise (1-2 sentences)\n");
        context.append("- Only provide detailed specs when specifically asked\n");

        return context.toString();
    }
}