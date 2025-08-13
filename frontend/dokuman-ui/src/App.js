// src/App.js
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import "./style.css";
import SignInForm from "./SignIn";
import SignUpForm from "./SignUp";
import DoCu from "./Docu";
import AdminPanel from "./AdminPanel"; // ✅ yeni admin panel bileşeni eklendi

// Korumalı rota helper'ı
const Protected = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/Login" replace />;
};

// Login sayfası
const AuthPage = () => {
  const [type, setType] = useState("signIn");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) navigate("/DoCu", { replace: true });
  }, [navigate]);

  const handleOnClick = (text) => {
    if (text !== type) setType(text);
  };

  const containerClass =
    "container " + (type === "signUp" ? "right-panel-active" : "");

  return (
    <div className="App">
      <h2> DoCu </h2>
      <div className={containerClass} id="container">
        <SignUpForm setType={setType} />
        <SignInForm />
        <div className="overlay-container">
          <div className="overlay">
            <div className="overlay-panel overlay-left">
              <h1>Welcome Back!</h1>
              <p>
                To keep connected with us please login with your personal info
              </p>
              <button
                className="ghost"
                id="signIn"
                onClick={() => handleOnClick("signIn")}
              >
                Sign In
              </button>
            </div>
            <div className="overlay-panel overlay-right">
              <h1>Welcome DoCu!</h1>
              <p>
                Enter your personal details and start journey with us
              </p>
              <button
                className="ghost"
                id="signUp"
                onClick={() => handleOnClick("signUp")}
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Login sayfası */}
        <Route path="/Login" element={<AuthPage />} />

        {/* Korumalı panel: /DoCu */}
        <Route
          path="/DoCu"
          element={
            <Protected>
              <DoCu />
            </Protected>
          }
        />

        {/* Korumalı admin panel: /Admin */}
        <Route
          path="/Admin"
          element={
            <Protected>
              <AdminPanel />
            </Protected>
          }
        />

        {/* Default yönlendirmeler */}
        <Route path="/" element={<Navigate to="/Login" replace />} />
        <Route path="*" element={<Navigate to="/Login" replace />} />
      </Routes>
    </Router>
  );
}
