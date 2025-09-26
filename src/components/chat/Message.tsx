import "./Message.css";

interface MessageProps {
  text: string;
  isSentByMe: boolean;
  timestamp: string;
  delivered?: boolean;
}

export function Message({ text, isSentByMe, timestamp, delivered }: MessageProps) {
  const containerClasses = `message-container ${
    isSentByMe ? "sent" : "received"
  }`;

  const formattedTime = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={containerClasses}>
      <div className="message-bubble">
        <p className="message-text">{text}</p>
        <span className="message-timestamp">
          {formattedTime}
          {isSentByMe && delivered ? (
            <span className="message-delivered" title="Delivered"> ✓</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
