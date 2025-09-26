import React, { useMemo, useState } from "react";
import "./MainLayout.css";
import pwnLogo from "../../assets/pwn_logo.png";

interface MainLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  sidebar,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // If sidebar is a valid React element, clone to inject a toggle handler
  const enhancedSidebar = useMemo(() => {
    if (React.isValidElement(sidebar)) {
      return React.cloneElement(sidebar as React.ReactElement, {
        onToggleMenu: () => setSidebarOpen((s) => !s),
      } as any);
    }
    return sidebar;
  }, [sidebar]);

  return (
    <div className="main-layout">
      <div className="app-title-bar">
        <div className="title-bar-left">
          <img src={pwnLogo} alt="PwnChat Logo" className="app-icon" />
          <span className="app-title">pwnbuffer.org</span>
        </div>
        <div className="window-controls">
          <button
            className="window-control minimize"
            onClick={() => window.electronAPI?.minimizeWindow?.()}
            title="Minimize"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="5" width="8" height="2" fill="currentColor" />
            </svg>
          </button>
          <button
            className="window-control maximize"
            onClick={() => window.electronAPI?.maximizeWindow?.()}
            title="Maximize"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <button
            className="window-control close"
            onClick={() => window.electronAPI?.closeWindow?.()}
            title="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="main-body">
        <aside className={`sidebar-container ${sidebarOpen ? "open" : "collapsed"}`}>{enhancedSidebar}</aside>
        <main className="content-container">
          <button
            className="floating-toggle"
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen((s) => !s)}
          >
            ☰
          </button>
          {children}
        </main>
      </div>
    </div>
  );
};
