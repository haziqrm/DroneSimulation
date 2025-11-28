package com.example.coursework1.dto;

import com.example.coursework1.service.DroneDispatchService.DeliveryRequest;
import java.util.List;

public class BatchDeliveryRequest {
    private String batchId;
    private List<DeliveryRequest> deliveries;

    public BatchDeliveryRequest() {
    }

    public BatchDeliveryRequest(String batchId, List<DeliveryRequest> deliveries) {
        this.batchId = batchId;
        this.deliveries = deliveries;
    }

    public String getBatchId() {
        return batchId;
    }

    public void setBatchId(String batchId) {
        this.batchId = batchId;
    }

    public List<DeliveryRequest> getDeliveries() {
        return deliveries;
    }

    public void setDeliveries(List<DeliveryRequest> deliveries) {
        this.deliveries = deliveries;
    }

    @Override
    public String toString() {
        return "BatchDeliveryRequest{" +
                "batchId='" + batchId + '\'' +
                ", deliveryCount=" + (deliveries != null ? deliveries.size() : 0) +
                '}';
    }
}