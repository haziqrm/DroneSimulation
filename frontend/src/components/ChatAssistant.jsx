import React, { useState, useRef, useEffect } from 'react';
import './ChatAssistant.css';

const ChatAssistant = ({ onDispatchSuccess }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: '👋 Hi! I\'m your AI mission advisor with DIRECT dispatch capabilities. I can send drones immediately - just tell me where and what to deliver!',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const parseDispatchCommand = (text) => {
    const latLngMatch = text.match(/(?:Dispatching to:|Destination:)\s*([\d.-]+),\s*([\d.-]+)/i);
    const capacityMatch = text.match(/(?:Package:|Delivery:)\s*([\d.]+)\s*kg/i);
    const coolingMatch = text.match(/with cooling|cooling:/i);
    const heatingMatch = text.match(/with heating|heating:/i);

    if (latLngMatch && capacityMatch) {
      return {
        latitude: parseFloat(latLngMatch[1]),
        longitude: parseFloat(latLngMatch[2]),
        capacity: parseFloat(capacityMatch[1]),
        cooling: coolingMatch !== null,
        heating: heatingMatch !== null
      };
    }

    return null;
  };

  const executeDispatch = async (dispatchData) => {
    try {
      console.log('AI executing dispatch:', dispatchData);
      
      const response = await fetch('http://localhost:8080/api/v1/chat/action/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dispatchData)
      });

      const result = await response.json();
      console.log('Dispatch result:', result);

      if (result.success && onDispatchSuccess) {
        onDispatchSuccess(result);
      }

    } catch (error) {
      console.error('Dispatch action failed:', error);

      const errorMessage = {
        id: Date.now(),
        role: 'assistant',
        content: 'Failed to execute dispatch. Backend error - check console.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8080/api/v1/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage.content })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.message,
        systemState: data.systemState,
        droneCapabilities: data.droneCapabilities,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      const dispatchData = parseDispatchCommand(data.message);
      if (dispatchData) {
        console.log('AI dispatch detected:', dispatchData);
        executeDispatch(dispatchData);
      }

    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Make sure the backend is running and GROQ_API_KEY is set.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = [
    "Send 3kg with cooling to Princes Street",
    "Dispatch 5kg to Edinburgh Castle",
    "Show all available drones",
    "What's the status of active deliveries?"
  ];

  const askQuickQuestion = (question) => {
    setInput(question);
  };

  return (
    <div className={`chat-assistant ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="chat-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="chat-title">
          <span>AI Mission Control</span>
        </div>
        <button className="chat-toggle">
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {isExpanded && (
        <div className="chat-body">
          <div className="messages-container">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                <div className="message-content">
                  {msg.content}
                  
                  {msg.systemState && (
                    <div className="system-state">
                      <small>
                        {msg.systemState.activeDrones} active • 
                        {msg.systemState.availableDrones} available
                      </small>
                    </div>
                  )}

                  {msg.droneCapabilities && msg.droneCapabilities.length > 0 && (
                    <div className="drone-table">
                      <table>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Status</th>
                            <th>Capacity</th>
                            <th>Moves</th>
                            <th>Features</th>
                          </tr>
                        </thead>
                        <tbody>
                          {msg.droneCapabilities.map((drone, idx) => (
                            <tr key={idx} className={drone.status === 'AVAILABLE' ? 'available' : 'busy'}>
                              <td><strong>{drone.id}</strong></td>
                              <td>
                                <span className={`status-pill ${drone.status.toLowerCase()}`}>
                                  {drone.status}
                                </span>
                              </td>
                              <td>{drone.capacity}</td>
                              <td>{drone.maxMoves}</td>
                              <td className="features-cell">
                                {drone.cooling === 'Yes' && <span title="Cooling">C</span>}
                                {drone.heating === 'Yes' && <span title="Heating">H</span>}
                                {drone.cooling === 'No' && drone.heating === 'No' && '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="message-timestamp">
                  {msg.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant loading">
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && (
            <div className="quick-questions">
              <div className="quick-questions-label">Try asking:</div>
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  className="quick-question"
                  onClick={() => askQuickQuestion(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-container">
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="How many drones are available currently..."
              rows="2"
              disabled={isLoading}
            />
            <button
              className="chat-send"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? '...' : '▶'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatAssistant;