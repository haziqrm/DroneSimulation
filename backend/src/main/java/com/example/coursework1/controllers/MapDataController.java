package com.example.coursework1.controllers;

import com.example.coursework1.dto.ServicePoint;
import com.example.coursework1.model.RestrictedArea;
import com.example.coursework1.service.RestrictedAreaService;
import com.example.coursework1.service.ServicePointService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/map")
public class MapDataController {

    private static final Logger logger = LoggerFactory.getLogger(MapDataController.class);
    private final RestrictedAreaService restrictedAreaService;
    private final ServicePointService servicePointService;

    public MapDataController(RestrictedAreaService restrictedAreaService,
                            ServicePointService servicePointService) {
        this.restrictedAreaService = restrictedAreaService;
        this.servicePointService = servicePointService;
    }

    @GetMapping("/restricted-areas")
    public ResponseEntity<List<RestrictedArea>> getRestrictedAreas() {
        logger.info("Fetching restricted areas for frontend");
        List<RestrictedArea> areas = restrictedAreaService.getRestrictedAreas();
        logger.info("Returning {} restricted areas", areas.size());
        return ResponseEntity.ok(areas);
    }

    @GetMapping("/service-points")
    public ResponseEntity<List<ServicePoint>> getServicePoints() {
        logger.info("Fetching service points for frontend");
        List<ServicePoint> points = servicePointService.fetchAllServicePoints();
        logger.info("Returning {} service points", points.size());
        return ResponseEntity.ok(points);
    }
}