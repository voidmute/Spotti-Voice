import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PillOverlay } from "./Pill";
import "../overlay.css";

document.documentElement.classList.add("overlay-page");
document.body.classList.add("overlay-body");
document.title = "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PillOverlay />
  </StrictMode>,
);
