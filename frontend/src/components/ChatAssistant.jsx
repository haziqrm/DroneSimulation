import React, { useState, useRef, useEffect } from 'react';
import './ChatAssistant.css';

const ChatAssistant = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: '👋 Hi! I\'m your AI mission advisor. Ask me anything about your drone operations!',
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
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: '❌ Sorry, I encountered an error. Make sure the backend is running and GROQ_API_KEY is set.',
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
    "What's the status of active drones?",
    "Why is there a delay?",
    "How many drones are available?",
    "Explain the current deliveries"
  ];

  const askQuickQuestion = (question) => {
    setInput(question);
  };

  return (
    <div className={`chat-assistant ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="chat-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="chat-title">
          <span className="chat-icon">🤖</span>
          <span>AI Mission Advisor</span>
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
                        📊 {msg.systemState.activeDrones} active • 
                        {msg.systemState.availableDrones} available
                      </small>
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
              placeholder="Ask about drone operations..."
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