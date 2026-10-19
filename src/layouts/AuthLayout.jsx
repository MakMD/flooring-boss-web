// src/layouts/AuthLayout.jsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { useAuth } from "../contexts/AuthContext";
import AssignedWorkers from "../components/AssignedWorkers/AssignedWorkers";
import styles from "./AuthLayout.module.css";
import Header from "../components/Header/Header";

const AuthLayout = () => {
  const { user, role, loading } = useAuth();
  const { pathname } = useLocation();

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

  const page = (
    <Suspense fallback={<div className={styles.loading}>Завантаження сторінки...</div>}>
      <Outlet />
    </Suspense>
  );

  return (
    <div className={styles.appContainer}>
      <Header />
      <main className={styles.mainContent}>
        {role === "admin" ? (
          <AssignedWorkers
            key={user.id}
            pathname={pathname}
            defaultOpen={["/addresses", "/calendar"].includes(pathname.replace(/\/$/, ""))}
          >
            {page}
          </AssignedWorkers>
        ) : page}
      </main>
    </div>
  );
};

export default AuthLayout;
