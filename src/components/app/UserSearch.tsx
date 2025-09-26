import { useState } from "react";
import { userAPI } from "../../utils/api";
import { Conversation } from "../../types";
import { Search } from "lucide-react";

interface UserSearchProps {
  onConversationSelect: (conversationId: string) => void;
  existingConversations: Conversation[];
  myUserId: string | null;
}

export function UserSearch({ onConversationSelect, existingConversations, myUserId }: UserSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [open, setOpen] = useState(false);

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setFilteredConversations([]);
      return;
    }

    // Filter existing conversations based on search term
    const filtered = existingConversations.filter(conversation =>
      conversation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conversation.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    setFilteredConversations(filtered);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="user-search">
      <div className={`search-shell ${open ? "open" : ""}`}>
        <input
          type="text"
          className="search-input"
          placeholder="Search conversations"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            handleSearch();
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <Search size={20} className="search-icon" /> {/* Use Lucide Search icon */}
      </div>

      {open && searchTerm.trim() && (
        <div className="search-dropdown">
          <div className="section">
            <div className="section-title">Conversations</div>
            {filteredConversations.length === 0 ? (
              <div className="section-empty">No conversations found</div>
            ) : (
              filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="result-item"
                  onClick={() => {
                    onConversationSelect(conversation.id);
                    setSearchTerm('');
                    setOpen(false);
                  }}
                >
                  <div
                    className="avatar"
                    style={{
                      backgroundImage: conversation.profilePicUrl ? `url(${conversation.profilePicUrl})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundColor: conversation.profilePicUrl ? 'transparent' : '#4B5563',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: '12px'
                    }}
                  >
                    {!conversation.profilePicUrl && conversation.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="label">{conversation.name}</div>
                  <div className="cta">Open</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}