import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const PRESET_CITIES = [
    {name: 'Chambéry', coords: '45.5646,5.9178'},
    {name: 'Bourg-saint-maurice', coords: '45.6172,6.7690'},
    {name: 'Grenoble', coords: '45.1885,5.7245'},
    {name: 'Lyon', coords: '45.7640,4.8357'},
    {name: 'Aoste', coords: '45.737087,7.319665'},
    {name: 'Turin', coords: '45.0703,7.6869'},
    {name: 'Rome', coords: '41.9028,12.4964'},
    {name: 'Milan', coords: '45.4642,9.1900'},
    {name: 'Naples', coords: '40.8518,14.2681'},
];

function eaqiToLevel(eaqi) {
    if (eaqi <= 20) return 'Bon';
    if (eaqi <= 40) return 'Correct';
    if (eaqi <= 60) return 'Modéré';
    if (eaqi <= 80) return 'Dégradé';
    if (eaqi <= 100) return 'Très dégradé';
    return 'Extrêmement mauvais';
}

function parseCoordinates(raw, fallbackCity) {
    const cleaned = (raw || '').replace(/^geo:/i, '').replace(';', ',').trim();
    const parts = cleaned.split(',').map(p => Number(p.trim()));
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        return {lat: parts[0], lon: parts[1]};
    }
    const preset = PRESET_CITIES.find(
        c => c.name.toLowerCase() === (fallbackCity || '').trim().toLowerCase()
    );
    if (preset) {
        const [lat, lon] = preset.coords.split(',').map(Number);
        return {lat, lon};
    }
    return null;
}

const PlumeAirIndicator = GObject.registerClass(
class PlumeAirIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, extension.metadata.name, false);
        this._extension = extension;
        this._settings = extension.getSettings();
        this._httpSession = new Soup.Session();
        this._timeoutId = null;
        this._destroyed = false;
        this._cityMenuItems = [];

        this._buildTopBarWidget();
        this._buildMenu();
        this._connectSettings();
        this._refreshData();
        this._scheduleRefresh();
    }

    _buildTopBarWidget() {
        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box plume-air-panel-box',
        });

        this._icon = new St.Icon({
            icon_name: 'weather-windy-symbolic',
            style_class: 'system-status-icon',
        });

        this._label = new St.Label({
            text: '--',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'plume-air-panel-label',
        });

        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);
    }

    _buildMenu() {
        this._headerItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const headerBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'plume-air-header',
        });

        const topRow = new St.BoxLayout({x_expand: true});
        this._cityTitle = new St.Label({
            text: this._settings.get_string('city'),
            x_expand: true,
            style_class: 'plume-air-city',
        });
        this._aqiBadge = new St.Label({
            text: '--',
            style_class: 'plume-air-aqi-badge',
        });
        topRow.add_child(this._cityTitle);
        topRow.add_child(this._aqiBadge);

        this._statusLabel = new St.Label({
            text: 'Chargement des données…',
            style_class: 'plume-air-status',
        });

        headerBox.add_child(topRow);
        headerBox.add_child(this._statusLabel);
        this._headerItem.add_child(headerBox);
        this.menu.addMenuItem(this._headerItem);

        this._forecastItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        this._forecastGrid = new St.BoxLayout({
            x_expand: true,
            style_class: 'plume-air-forecast-row',
        });
        this._forecastItem.add_child(this._forecastGrid);
        this.menu.addMenuItem(this._forecastItem);

        this._pollutantsItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        this._pollutantsLabel = new St.Label({
            text: 'PM2.5 : -- µg/m³  •  PM10 : -- µg/m³  •  NO₂ : -- µg/m³',
            style_class: 'plume-air-pollutants',
        });
        this._pollutantsItem.add_child(this._pollutantsLabel);
        this.menu.addMenuItem(this._pollutantsItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._citySubmenu = new PopupMenu.PopupSubMenuMenuItem('Changer de ville');
        this._populateCitySubmenu();
        this.menu.addMenuItem(this._citySubmenu);

        const refreshItem = new PopupMenu.PopupMenuItem('Actualiser maintenant');
        refreshItem.connect('activate', () => this._refreshData());
        this.menu.addMenuItem(refreshItem);

        const prefsItem = new PopupMenu.PopupMenuItem('Paramètres');
        prefsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(prefsItem);
    }

    _populateCitySubmenu() {
        const currentName = this._settings.get_string('city');
        const currentCoords = this._settings.get_string('city-slug');

        for (const city of PRESET_CITIES) {
            const item = new PopupMenu.PopupMenuItem(city.name);
            const isSelected = city.name === currentName || city.coords === currentCoords;
            item.setOrnament(isSelected ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);

            item.connect('activate', () => {
                if (this._destroyed)
                    return;
                this._settings.set_string('city', city.name);
                this._settings.set_string('city-slug', city.coords);
            });

            this._citySubmenu.menu.addMenuItem(item);
            this._cityMenuItems.push({city, item});
        }
    }

    _updateCityOrnaments() {
        if (this._destroyed)
            return;
        const currentName = this._settings.get_string('city');
        const currentCoords = this._settings.get_string('city-slug');

        for (const entry of this._cityMenuItems) {
            const isSelected = entry.city.name === currentName || entry.city.coords === currentCoords;
            entry.item.setOrnament(isSelected ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        }
    }

    _connectSettings() {
        this._settingsChangedIds = [
            this._settings.connect('changed::city', () => {
                if (this._destroyed)
                    return;
                this._cityTitle.text = this._settings.get_string('city');
                this._updateCityOrnaments();
                this._refreshData();
            }),
            this._settings.connect('changed::city-slug', () => {
                if (this._destroyed)
                    return;
                this._updateCityOrnaments();
                this._refreshData();
            }),
            this._settings.connect('changed::refresh-interval', () => {
                if (this._destroyed)
                    return;
                this._scheduleRefresh();
            }),
        ];
    }

    _scheduleRefresh() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        const minutes = Math.max(5, this._settings.get_int('refresh-interval'));
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            minutes * 60,
            () => {
                if (this._destroyed)
                    return GLib.SOURCE_REMOVE;
                this._refreshData();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    async _fetchJson(url) {
        const message = Soup.Message.new('GET', url);
        const bytes = await this._httpSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null
        );
        if (this._destroyed)
            return null;
        if (message.status_code !== Soup.Status.OK)
            throw new Error(`HTTP ${message.status_code}`);
        const decoder = new TextDecoder('utf-8');
        return JSON.parse(decoder.decode(bytes.get_data()));
    }

    async _resolveCoordinates(rawCoords, cityName) {
        const parsed = parseCoordinates(rawCoords, cityName);
        if (parsed)
            return parsed;

        const geoUrl =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=fr&format=json`;
        const geoJson = await this._fetchJson(geoUrl);
        if (!geoJson?.results?.length)
            throw new Error(`Ville introuvable : ${cityName}`);

        return {
            lat: geoJson.results[0].latitude,
            lon: geoJson.results[0].longitude,
        };
    }

    async _refreshData() {
        if (this._destroyed || !this._httpSession)
            return;

        const city = this._settings.get_string('city');
        const rawCoords = this._settings.get_string('city-slug');

        this._cityTitle.text = city;

        try {
            const coords = await this._resolveCoordinates(rawCoords, city);
            if (this._destroyed || !coords)
                return;

            const url =
                `https://air-quality-api.open-meteo.com/v1/air-quality` +
                `?latitude=${coords.lat}&longitude=${coords.lon}` +
                `&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone` +
                `&hourly=european_aqi` +
                `&forecast_days=2&timezone=auto`;

            const json = await this._fetchJson(url);
            if (this._destroyed || !json)
                return;

            const cur = json.current || {};
            const eaqi = Math.round(Number(cur.european_aqi ?? 0));
            const pm25 = cur.pm2_5 !== undefined ? Number(cur.pm2_5).toFixed(1) : '--';
            const pm10 = cur.pm10 !== undefined ? Number(cur.pm10).toFixed(1) : '--';
            const no2 = cur.nitrogen_dioxide !== undefined ? Number(cur.nitrogen_dioxide).toFixed(1) : '--';

            const hourlyTimes = json.hourly?.time || [];
            const hourlyAqi = json.hourly?.european_aqi || [];
            const currentTimeStr = cur.time || '';

            let startIndex = hourlyTimes.findIndex(t => t > currentTimeStr);
            if (startIndex < 0)
                startIndex = 0;

            const forecast = [];
            for (let i = startIndex; i < Math.min(startIndex + 5, hourlyTimes.length); i++) {
                const hourPart = hourlyTimes[i]?.split('T')[1]?.slice(0, 5) ?? '--:--';
                forecast.push({
                    hour: hourPart,
                    aqi: Math.round(Number(hourlyAqi[i] ?? eaqi)),
                });
            }

            this._renderData({
                aqi: eaqi,
                level: eaqiToLevel(eaqi),
                pm25,
                pm10,
                no2,
                forecast,
            }, false);
        } catch (err) {
            if (this._destroyed)
                return;
            console.error(`[PlumeAirQuality] Erreur Open-Meteo (${city}) : ${err.message}`);
            this._renderData(this._getFallbackData(city, rawCoords), true);
        }
    }

    _getFallbackData(city, rawCoords) {
        const seed = [...(rawCoords || city)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const baseAqi = 15 + (seed % 40);
        const now = new Date();
        const forecast = [];

        for (let i = 1; i <= 5; i++) {
            const h = (now.getHours() + i) % 24;
            const hh = String(h).padStart(2, '0');
            const delta = ((seed + i * 3) % 7) - 3;
            forecast.push({
                hour: `${hh}:00`,
                aqi: Math.max(5, baseAqi + delta),
            });
        }

        return {
            aqi: baseAqi,
            level: eaqiToLevel(baseAqi),
            pm25: (baseAqi * 0.24).toFixed(1),
            pm10: (baseAqi * 0.45).toFixed(1),
            no2: (baseAqi * 0.52).toFixed(1),
            forecast,
        };
    }

    _renderData(data, isDemo) {
        if (this._destroyed)
            return;

        const aqi = Number(data.aqi ?? 0);
        const level = data.level || eaqiToLevel(aqi);
        const pm25 = data.pm25 ?? '--';
        const pm10 = data.pm10 ?? '--';
        const no2 = data.no2 ?? '--';
        const forecast = Array.isArray(data.forecast) ? data.forecast.slice(0, 5) : [];

        this._label.text = `${aqi}`;
        this._aqiBadge.text = `${aqi} • ${level}`;
        this._statusLabel.text = isDemo
            ? 'Mode hors-ligne / aperçu (vérifiez la connexion ou la ville)'
            : `Qualité de l'air (EAQI) : ${level}`;

        this._pollutantsLabel.text =
            `PM2.5 : ${pm25} µg/m³  •  PM10 : ${pm10} µg/m³  •  NO₂ : ${no2} µg/m³`;

        this._forecastGrid.remove_all_children();
        for (const slot of forecast) {
            const col = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'plume-air-forecast-col',
            });

            const hourLbl = new St.Label({
                text: slot.hour ?? '--:--',
                x_align: Clutter.ActorAlign.CENTER,
                style_class: 'plume-air-forecast-hour',
            });

            const icon = new St.Icon({
                icon_name: slot.aqi <= 40 ? 'weather-clear-symbolic' : 'weather-windy-symbolic',
                x_align: Clutter.ActorAlign.CENTER,
                style_class: 'plume-air-forecast-icon',
            });

            const valLbl = new St.Label({
                text: `${slot.aqi}`,
                x_align: Clutter.ActorAlign.CENTER,
                style_class: 'plume-air-forecast-val',
            });

            col.add_child(hourLbl);
            col.add_child(icon);
            col.add_child(valLbl);
            this._forecastGrid.add_child(col);
        }
    }

    destroy() {
        this._destroyed = true;

        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._settingsChangedIds) {
            for (const id of this._settingsChangedIds)
                this._settings.disconnect(id);
            this._settingsChangedIds = null;
        }

        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }

        this._cityMenuItems = [];
        super.destroy();
    }
});

export default class PlumeAirQualityExtension extends Extension {
    enable() {
        this._indicator = new PlumeAirIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
