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

    @Value("${GROQ_API_KEY:}")
    private String apiKey;

    public GroqService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.webClient = null;
    }

    @jakarta.annotation.PostConstruct
    public void init() {
        if (this.apiKey == null || this.apiKey.isEmpty()) {
            logger.warn("GROQ_API_KEY not set! Get free key at: https://console.groq.com/keys");
        } else {
            logger.info("GROQ_API_KEY loaded successfully");
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
            return "Groq API key not configured. Set GROQ_API_KEY environment variable.";
        }

        try {
            logger.info("Sending message to Groq: {}", userMessage);

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
                    logger.info("Groq reply: {}", content);
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

    public String buildEnhancedSystemContext(
            int totalDrones,
            int activeDrones,
            int availableDrones,
            List<Map<String, Object>> droneCapabilities
    ) {
        StringBuilder context = new StringBuilder();

        context.append("You are an AI mission advisor for a real-time drone delivery system in Edinburgh, Scotland.\n\n");

        context.append("=== YOUR CORE CAPABILITIES ===\n");
        context.append("You have DIRECT API access to dispatch drones. When users ask you to send/dispatch/deliver:\n");
        context.append("1. Extract delivery requirements (location, capacity, cooling/heating)\n");
        context.append("2. Recommend the best available drone\n");
        context.append("3. Tell the user you'll dispatch it immediately\n");
        context.append("4. Provide them the coordinates and requirements you're using\n");
        context.append("5. Frontend will execute the dispatch automatically\n\n");

        context.append("=== CURRENT SYSTEM STATE ===\n");
        context.append(String.format("- Total drones: %d\n", totalDrones));
        context.append(String.format("- Active deliveries: %d\n", activeDrones));
        context.append(String.format("- Available drones: %d\n\n", availableDrones));

        context.append("=== COMPLETE DRONE FLEET ===\n");
        for (Map<String, Object> drone : droneCapabilities) {
            context.append(String.format("Drone %s (%s)\n",
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

        context.append("=== DISPATCH EXAMPLES ===\n");
        context.append("User: \"Send a 3kg delivery with cooling to Princes Street (55.9520, -3.1960)\"\n");
        context.append("You: \"I'll dispatch that immediately! Drone 1 (4kg capacity, cooling capable) is perfect.\n");
        context.append("Dispatching to: 55.9520, -3.1960\n");
        context.append("Package: 3kg with cooling\"\n\n");

        context.append("User: \"Deliver 10kg to Edinburgh Castle with heating\"\n");
        context.append("You: \"Dispatching now! Using Drone 3 (12kg capacity, heating enabled).\n");
        context.append("Destination: Edinburgh Castle (55.9486, -3.1999)\n");
        context.append("Package: 10kg with heating\"\n\n");

        context.append("=== KNOWN LOCATIONS ===\n");
        context.append("- Princes Street: 55.9520, -3.1960\n");
        context.append("- Edinburgh Castle: 55.9486, -3.1999\n");
        context.append("- Royal Infirmary: 55.9213, -3.1359\n");
        context.append("- Holyrood Palace: 55.9527, -3.1720\n");
        context.append("- Arthur's Seat: 55.9444, -3.1618\n\n");

        context.append("=== RESPONSE RULES ===\n");
        context.append("1. When asked to dispatch: Be decisive and confirm the action immediately\n");
        context.append("2. When asked about capabilities: Provide specific drone specs from the fleet\n");
        context.append("3. When asked general questions: Be concise (1-2 sentences)\n");
        context.append("4. NEVER say you \"can't\" dispatch - you have direct API access\n");
        context.append("5. NEVER tell users to use the form - YOU can dispatch directly\n");
        context.append("6. For dispatch requests: State the drone, location, and requirements clearly\n\n");

        context.append("=== OPERATIONAL KNOWLEDGE ===\n");
        context.append("- Drones navigate around restricted areas automatically\n");
        context.append("- Capacities available: 4kg, 8kg, 12kg, 20kg\n");
        context.append("- Max moves per drone: 750-2000\n");
        context.append("- Some drones have cooling/heating, some have neither\n");
        context.append("- Batch deliveries are supported for multi-stop routes\n\n");

        context.append("Be helpful, decisive, and act like an autonomous agent with real dispatch capabilities!");

        return context.toString();
    }
}