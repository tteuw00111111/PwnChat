import "./Message.css"; // Make sure to import the stylesheet

// Define the component's props interface
interface MessageProps {
  text: string;
  isSentByMe: boolean; // The new prop to determine styling
}

export function Message({ text, isSentByMe }: MessageProps) {
  // Determine the CSS classes to apply based on who sent the message.
  const containerClasses = `message-container ${
    isSentByMe ? "sent" : "received"
  }`;

  return (
    <div className={containerClasses}>
      <div className="message-bubble">
        <p className="message-text">{text}</p>
      </div>
    </div>
  );
}
