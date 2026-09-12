// src/components/Header/Header.jsx
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import {
  FaProjectDiagram,
  FaUsers,
  FaCalendarAlt,
  FaCog,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaBell,
  FaCheckDouble,
  FaFileInvoice,
  FaBuilding,
} from "react-icons/fa";
import { useAuth } from "../../contexts/AuthContext";
import styles from "./Header.module.css";

const Header = () => {
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef(null);

  const getLinkClass = (path) => {
    return location.pathname.startsWith(path)
      ? `${styles.navLink} ${styles.activeLink}`
      : styles.navLink;
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Помилка при виході:", error);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    setIsNotifOpen(false);
  };

  useEffect(() => {
    if (!user || userRole !== "admin") return;

    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        if (data) {
          setNotifications(data);
          setUnreadCount(data.filter((n) => !n.is_read).length);
        }
      } catch (error) {
        console.error("Помилка завантаження сповіщень:", error);
      }
    };

    fetchNotifications();

    const subscription = supabase
      .channel("admin_notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user, userRole]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (id, link) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setIsNotifOpen(false);
      closeMobileMenu();
      if (link) navigate(link);
    } catch (error) {
      console.error("Помилка при оновленні сповіщення:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id);

      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Помилка при оновленні всіх сповіщень:", error);
    }
  };

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logoLink} onClick={closeMobileMenu}>
        <img
          src="/Flooring.Boss.svg"
          alt="Flooring Boss Logo"
          className={styles.logo}
        />
      </Link>

      <button
        className={styles.hamburgerButton}
        onClick={toggleMobileMenu}
        aria-label="Toggle mobile menu"
      >
        <FaBars />
      </button>

      <nav
        className={`${styles.nav} ${isMobileMenuOpen ? styles.navMobileOpen : ""}`}
      >
        {isMobileMenuOpen && (
          <div className={styles.mobileMenuHeader}>
            <span
              style={{
                fontWeight: "bold",
                fontSize: "1.2rem",
                color: "var(--color-text-primary)",
              }}
            >
              Меню
            </span>
            <button
              className={styles.closeButton}
              onClick={closeMobileMenu}
              aria-label="Close mobile menu"
            >
              <FaTimes />
            </button>
          </div>
        )}

        {/* === ОНОВЛЕНИЙ ПОРЯДОК МЕНЮ ДЛЯ АДМІНІСТРАТОРА === */}
        {userRole === "admin" && (
          <>
            <Link
              to="/addresses"
              className={getLinkClass("/addresses")}
              onClick={closeMobileMenu}
            >
              <FaProjectDiagram />
              Projects
            </Link>

            <Link
              to="/calendar"
              className={getLinkClass("/calendar")}
              onClick={closeMobileMenu}
            >
              <FaCalendarAlt />
              Calendar
            </Link>

            <Link
              to="/people"
              className={getLinkClass("/people")}
              onClick={closeMobileMenu}
            >
              <FaUsers />
              People
            </Link>

            <Link
              to="/store-invoices"
              className={getLinkClass("/store-invoices")}
              onClick={closeMobileMenu}
            >
              <FaFileInvoice />
              Store Invoices
            </Link>

            <Link
              to="/builders"
              className={getLinkClass("/builders")}
              onClick={closeMobileMenu}
            >
              <FaBuilding />
              Builders
            </Link>

            <Link
              to="/admin"
              className={getLinkClass("/admin")}
              onClick={closeMobileMenu}
            >
              <FaCog />
              Admin
            </Link>
          </>
        )}

        {userRole === "worker" && (
          <div
            className={styles.navLink}
            style={{ cursor: "default", color: "var(--color-primary)" }}
          >
            Особистий кабінет
          </div>
        )}

        <div className={styles.navControls}>
          {userRole === "admin" && (
            <div className={styles.notifContainer} ref={notifRef}>
              <button
                className={styles.notifButton}
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                aria-label="Notifications"
              >
                <FaBell />
                <span className={styles.mobileOnlyText}>Сповіщення</span>
                {unreadCount > 0 && (
                  <span className={styles.notifBadge}>{unreadCount}</span>
                )}
              </button>

              {isNotifOpen && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifHeader}>
                    <span className={styles.notifTitle}>Сповіщення</span>
                    {unreadCount > 0 && (
                      <button
                        className={styles.markAllBtn}
                        onClick={markAllAsRead}
                      >
                        <FaCheckDouble /> Прочитати все
                      </button>
                    )}
                  </div>
                  <div className={styles.notifList}>
                    {notifications.length === 0 ? (
                      <div className={styles.emptyNotif}>
                        Немає нових сповіщень
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`${styles.notifItem} ${
                            !n.is_read ? styles.notifUnread : ""
                          }`}
                          onClick={() => markAsRead(n.id, n.link)}
                        >
                          <div className={styles.notifItemTitleRow}>
                            <span className={styles.notifItemTitle}>
                              {n.title}
                            </span>
                            {!n.is_read && (
                              <span className={styles.unreadDot}></span>
                            )}
                          </div>
                          <p className={styles.notifItemMessage}>{n.message}</p>
                          <span className={styles.notifItemDate}>
                            {new Date(n.created_at).toLocaleString("uk-UA", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={handleLogout} className={styles.logoutButton}>
            <FaSignOutAlt />
            <span className={styles.desktopOnly}>Log Out</span>
            <span className={styles.mobileOnlyText}>Вийти з акаунта</span>
          </button>
        </div>
      </nav>

      <div
        className={styles.overlay}
        onClick={closeMobileMenu}
        style={{ display: isMobileMenuOpen ? "block" : "none" }}
      ></div>
    </header>
  );
};

export default Header;
