# TerraLens 🛰️ | Orbital Tracking & Earth Exploration

TerraLens es una plataforma de visualización terrestre inmersiva que combina la potencia de **MapLibre GL JS** con el rastreo de satélites en tiempo real mediante **satellite.js**. Diseñada con una estética cyberpunk/futurista y efectos de post-procesamiento cinematográficos.

![TerraLens Preview](https://raw.githubusercontent.com/JoseAlvarezDev/TerraLens/main/src/assets/img/satelite512px.png)

## 🚀 Características Principales

- **Real-Time Satellite Tracking**: Visualización en vivo de la **Estación Espacial Internacional (ISS)** y la constelación **Starlink**.
- **Orbital HUD Mode**: Interfaz de telemetría dinámica con efectos de scanlines, filtros tácticos y monitor de datos en tiempo real.
- **Cinematic Experience**: Vuelos automatizados sobre ubicaciones curadas con transiciones suaves y rotación de cámara estabilizada.
- **Multispectral Filters**: Simulación de sensores satelitales (Infrarrojo, Monocromo, Oceánico, Vista Térmica).
- **Global Search**: Buscador integrado con autocompletado y navegación rápida.
- **Post-processing UI**: Diseño basado en Glassmorphism optimizado para máxima inmersión.

## 🛠️ Stack Tecnológico

- **Core**: Vanilla JS (ES6+), HTML5, CSS3.
- **Mapping**: MapLibre GL JS.
- **Telemetry**: Satellite.js (TLE Orbital Mechanics).
- **API's**: OpenStreetMap (Nominatim), Open-Meteo, TimeAPI, WhereTheISS.
- **Design**: Google Fonts (Outfit), Custom CSS Post-processing.

## 🔧 Instalación y Desarrollo Local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/josealvarezdev/terralens.git
   cd terralens
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Iniciar servidor de desarrollo**:
   ```bash
   npm run dev
   ```

4. **Construir para producción**:
   ```bash
   npm run build
   ```

## 📂 Estructura del Proyecto

- `index.html`: Punto de entrada principal y estructura del HUD.
- `style.css`: Motor de diseño, filtros CSS y animaciones tácticas.
- `src/main.js`: Lógica central, integración de mapas y telemetría satelital.
- `src/locations.js`: Base de datos de localizaciones curadas.
- `llms.txt`: Documentación semántica optimizada para modelos de IA.

## 📜 Licencia

Este proyecto está bajo la licencia MIT.

---
Desarrollado por **Jose Alvarez Dev** | 2026
