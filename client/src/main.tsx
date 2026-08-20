import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Make sure Leaflet CSS is loaded globally to fix map tile rendering
import 'leaflet/dist/leaflet.css';

// Find root element
const rootElement = document.getElementById("root");

// Render the application
if (rootElement) {
  createRoot(rootElement).render(<App />);
} else {
  console.error("Failed to find the root element");
}
