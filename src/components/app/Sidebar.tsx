import { Conversation } from "../../types";
import { ConversationList } from "../conversations/ConversationList";
import { UserSearch } from "./UserSearch";
import "./Sidebar.css";
import pwnLogo from "../../assets/pwn_logo.png";
import { Menu, Search, Plus, Settings } from "lucide-react";
import { useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { HamburgerMenu } from './HamburgerMenu';
import { AddUserModal } from './AddUserModal';
import { userAPI } from '../../utils/api';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onConversationClick: (id: string) => void;
  onUserSelect: (user: Conversation) => void; // New prop for adding users
  myUserId: string | null;
  onToggleMenu?: () => void; // New: allow parent to control visibility
}

export function Sidebar({
  conversations,
  activeConversationId,
  onConversationClick,
  onUserSelect,
  myUserId,
  onToggleMenu,
}: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="hamburger-menu" aria-label="Toggle menu" onClick={() => setShowHamburgerMenu(true)}>
          <Menu size={24} />
        </button>
        <div className="sidebar-search-container">
          <UserSearch
            onConversationSelect={onConversationClick}
            existingConversations={conversations}
            myUserId={myUserId}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="header-action" aria-label="Add new user" onClick={() => setShowAddUser(true)}>
            <Plus size={18} />
          </button>
        </div>
      </div>
      <div className="sidebar-conversations">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onConversationClick={onConversationClick}
        />
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onAddUser={async (username) => {
            try {
              // Search for the user by username
              const users = await userAPI.search(username);
              const foundUser = users.find((user: any) => user.username === username);

              if (foundUser) {
                const newUser: Conversation = {
                  id: foundUser.id,
                  name: foundUser.name,
                  username: foundUser.username,
                  profilePicUrl: foundUser.profilePicUrl
                };
                onUserSelect(newUser);
              } else {
                throw new Error(`User "${username}" not found`);
              }
            } catch (error) {
              console.error('Failed to add user:', error);
              // The AddUserModal will handle displaying the error
              throw error;
            }
          }}
        />
      )}
      <HamburgerMenu
        isOpen={showHamburgerMenu}
        onClose={() => {
          setShowHamburgerMenu(false);
          if (onToggleMenu) {
            onToggleMenu();
          }
        }}
        onSettingsClick={() => setShowSettings(true)}
      />
    </aside>
  );
}
