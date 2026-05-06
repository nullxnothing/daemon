import './NavigationGuide.css'

export function NavigationGuide() {
  return (
    <div className="nav-guide">
      <div className="nav-guide-header">
        <h3 className="nav-guide-title">Navigation Guide</h3>
        <p className="nav-guide-desc">
          DAEMON has multiple ways to access tools and features. Here's when to use each:
        </p>
      </div>

      <div className="nav-guide-methods">
        <div className="nav-guide-method">
          <div className="nav-guide-method-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M4 8a2.5 2.5 0 0 1 2.5-2.5h4.25l1.65 1.8h5.1A2.5 2.5 0 0 1 20 9.8v6.7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5V8Z" />
            </svg>
          </div>
          <div className="nav-guide-method-content">
            <h4 className="nav-guide-method-title">Icon Sidebar</h4>
            <p className="nav-guide-method-desc">
              <strong>Use for:</strong> Frequently used tools you want always visible
            </p>
            <p className="nav-guide-method-usage">
              Click to toggle Explorer, right-click pinned tools to unpin. Drag tools from the drawer to pin them here.
            </p>
          </div>
        </div>

        <div className="nav-guide-method">
          <div className="nav-guide-method-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M6 6.25h5.25v4.5H6zM12.75 13.25H18v4.5h-5.25zM12.75 6.25H18v4.5h-5.25zM6 13.25h5.25v4.5H6z" />
            </svg>
          </div>
          <div className="nav-guide-method-content">
            <h4 className="nav-guide-method-title">Command Drawer <code>Ctrl+K</code></h4>
            <p className="nav-guide-method-desc">
              <strong>Use for:</strong> Browsing all available tools, discovering features
            </p>
            <p className="nav-guide-method-usage">
              Opens a full panel with search. Perfect when you're exploring what's available or need a tool you don't use often.
            </p>
          </div>
        </div>

        <div className="nav-guide-method">
          <div className="nav-guide-method-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <div className="nav-guide-method-content">
            <h4 className="nav-guide-method-title">Command Palette <code>Ctrl+Shift+P</code></h4>
            <p className="nav-guide-method-desc">
              <strong>Use for:</strong> Quick actions and commands
            </p>
            <p className="nav-guide-method-usage">
              Type to search all available commands. Fast keyboard-driven access for power users.
            </p>
          </div>
        </div>

        <div className="nav-guide-method">
          <div className="nav-guide-method-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
          <div className="nav-guide-method-content">
            <h4 className="nav-guide-method-title">Quick Open <code>Ctrl+P</code></h4>
            <p className="nav-guide-method-desc">
              <strong>Use for:</strong> Opening files quickly
            </p>
            <p className="nav-guide-method-usage">
              Fuzzy search across all files in the active project. Fastest way to jump to a specific file.
            </p>
          </div>
        </div>
      </div>

      <div className="nav-guide-tip">
        <strong>💡 Pro tip:</strong> Pin your 3-5 most-used tools to the sidebar, use Command Drawer for occasional tools, and Command Palette for quick actions.
      </div>
    </div>
  )
}
