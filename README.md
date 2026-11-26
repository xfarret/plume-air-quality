# Plume Air Quality — GNOME Shell Extension

A lightweight, Plume Labs–inspired GNOME Shell extension (compatible with **GNOME Shell 50+**) that displays real-time European Air Quality Index (**EAQI**) data, pollutant levels ($\text{PM}_{2.5}$, $\text{PM}_{10}$, $\text{NO}_2$), and 5-hour forecasts directly in the top bar.

Powered by the free [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (Copernicus CAMS atmospheric data)—no API key or registration required.

---

## Features

- **Minimal Top-Bar Indicator:** Displays a clean wind icon alongside the current numeric EAQI score (e.g., `39`).
- **Detailed Dropdown Menu:**
  - Current EAQI score and qualitative air quality rating (*Bon*, *Correct*, *Modéré*, *Dégradé*, *Très dégradé*, *Extrêmement mauvais*).
  - **5-Hour Forecast:** Hourly EAQI trend for the next five hours.
  - **Key Pollutants:** Real-time concentrations in $\mu\text{g/m}^3$ for $\text{PM}_{2.5}$, $\text{PM}_{10}$, and $\text{NO}_2$.
- **Quick City Switcher:** Switch effortlessly between preset cities (*Porte-de-Savoie*, *Chambéry*, *Bourg-Saint-Maurice*, *Grenoble*, *Lyon*, *Turin*, *Rome*, *Milan*, *Naples*).
- **Custom Location & Automatic Geocoding:** Set any city name or exact `latitude,longitude` coordinates in the preferences window.
- **Zero-Config Data Source:** Uses Open-Meteo out of the box with no API token needed and graceful offline fallback handling.

---

## Requirements

- **GNOME Shell:** `50` or newer
- **Utilities:** `glib-compile-schemas`, `gnome-extensions` CLI

---

## Installation

### From a Packaged Archive (`.zip`)

```bash
gnome-extensions install --force plume-air-quality@xfarret.zip
gnome-extensions enable plume-air-quality@xfarret
```

### Manual Installation from Source

1. Copy the extension folder to your local GNOME Shell extensions directory:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/
   cp -r plume-air-quality@xfarret ~/.local/share/gnome-shell/extensions/
   ```

2. Compile the GSettings schema:
   ```bash
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/plume-air-quality@xfarret/schemas/
   ```

3. Enable the extension:
   ```bash
   gnome-extensions enable plume-air-quality@xfarret
   ```

4. Log out and log back in (or restart GNOME Shell) so the shell loads the new extension.

---

## Configuration

Open the extension preferences via the **Paramètres** button in the top-bar menu or from the terminal:

```bash
gnome-extensions prefs plume-air-quality@xfarret
```

Available settings:
- **Nom de la ville:** Display name shown in the dropdown header.
- **Coordonnées GPS (`lat,lon`):** Coordinates used for the Open-Meteo query (e.g., `45.4989,6.0003`). Leave blank to automatically geocode the city name.
- **Actualisation (minutes):** Refresh interval between `5` and `360` minutes (default: `30`).

---

## Project Structure

```text
plume-air-quality@xfarret/
├── extension.js                                              # Panel indicator, popup menu, Open-Meteo client
├── prefs.js                                                  # Adwaita/GTK4 preferences window
├── metadata.json                                             # Extension UUID, name, and GNOME Shell version
├── stylesheet.css                                            # Custom panel and menu styling
└── schemas/
    ├── org.gnome.shell.extensions.plume-air-quality.gschema.xml
    └── gschemas.compiled
```

---

## Debugging

If you modify the code and want to inspect live logs from GNOME Shell:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i PlumeAirQuality
```


---

## Development

This project is developed with the assistance of AI tools. All changes are planned or approved by the author, and all AI-generated code is reviewed and tested before it is merged.

---

## License

This project is open-source and available under the [MIT License](LICENSE).
