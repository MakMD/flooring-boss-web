// src/layouts/AuthLayout.jsx
import { Navigate, Outlet } from "react-router-dom";
import { Suspense } from "react";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Header/Header";
import styles from "./AuthLayout.module.css";

const AuthLayout = () => {
  const { user, loading } = useAuth();

  // Якщо контекст ще вантажиться, чекаємо
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "20vh",
          color: "var(--color-text-primary)",
        }}
      >
        Перевірка сесії...
      </div>
    );
  }

  // Якщо сесія перевірена, але юзера немає - на логін
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Якщо все добре - малюємо сторінку
  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      <Header />
      <main className={styles.mainContent}>
        <Suspense
          fallback={
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                color: "var(--color-text-primary)",
              }}
            >
              Завантаження сторінки...
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default AuthLayout;
