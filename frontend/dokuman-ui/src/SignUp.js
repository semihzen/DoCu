import React, { useState } from "react";
import axios from "axios";

function SignUpForm() {
  const [state, setState] = useState({
    name: "",
    email: "",
    password: ""
  });

  const handleChange = (evt) => {
    const { name, value } = evt.target;
    setState((prevState) => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleOnSubmit = async (evt) => {
  evt.preventDefault();

  try {
    const response = await axios.post("http://localhost:5244/api/users/register", {
      name: state.name,
      email: state.email,
      password: state.password,
    });

    alert("Kayıt başarılı!");
    setState({ name: "", email: "", password: "" });
  } catch (error) {
    if (error.response && error.response.data) {
      // Backend'den gelen mesajı al
      alert(`Kayıt sırasında hata: ${error.response.data}`);
    } else {
      alert("Bilinmeyen bir hata oluştu.");
    }
  }
};

  return (
    <div className="form-container sign-up-container">
      <form onSubmit={handleOnSubmit}>
        <h1>Create Account</h1>

        <input
          type="text"
          name="name"
          value={state.name}
          onChange={handleChange}
          placeholder="Name"
          required
        />
        <input
          type="email"
          name="email"
          value={state.email}
          onChange={handleChange}
          placeholder="Email"
          required
        />
        <input
          type="password"
          name="password"
          value={state.password}
          onChange={handleChange}
          placeholder="Password"
          required
        />

        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}

export default SignUpForm;
