import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CityApp } from "./CityApp";
import "./standalone.css";

if (import.meta.env.MODE === "debug") {
  void import("./debug/isolationFaults");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><CityApp /></StrictMode>,
);
