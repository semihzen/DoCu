// src/App.js
import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./style.css";
import SignInForm from "./SignIn";
import SignUpForm from "./SignUp";
import DoCu from "./Docu";

// Korumalı rota helper'ı (aynı dosyada)
const Protected = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/Login" replace />;
};

// Login sayfası (eski App.js içeriğin—aynen burada, başka dosyaya taşımadım)
const AuthPage = () => {
  const [type, setType] = useState("signIn");
  const navigate = useNavigate();

  // Zaten login'liyse burayı gösterme, panele at
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
        {/* SignInForm'a setType göndermene gerek yok, ama kalırsa da sorun değil */}
        <SignInForm />
        <div className="overlay-container">
          <div className="overlay">
            <div className="overlay-panel overlay-left">
              <h1>Welcome Back!</h1>
              <p>To keep connected with us please login with your personal info</p>
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
              <p>Enter your personal details and start journey with us</p>
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
        {/* Tek route: /Login → aynı sayfada SignIn + SignUp */}
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

        {/* Kök ve diğer her şey → /Login */}
        <Route path="/" element={<Navigate to="/Login" replace />} />
        <Route path="*" element={<Navigate to="/Login" replace />} />
      </Routes>
    </Router>
  );
}
