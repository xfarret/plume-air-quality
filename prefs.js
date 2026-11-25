import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PlumeAirPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Général',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const cityGroup = new Adw.PreferencesGroup({
            title: 'Ville (Open-Meteo)',
            description: 'Saisissez une ville ou ses coordonnées GPS (lat,lon). Laissez les coordonnées vides pour une recherche automatique par nom.',
        });
        page.add(cityGroup);

        const cityRow = new Adw.EntryRow({
            title: 'Nom de la ville',
            text: settings.get_string('city'),
        });
        cityRow.connect('changed', () => {
            settings.set_string('city', cityRow.get_text());
        });
        cityGroup.add(cityRow);

        const coordsRow = new Adw.EntryRow({
            title: 'Coordonnées GPS (ex. 45.4989,6.0003)',
            text: settings.get_string('city-slug'),
        });
        coordsRow.connect('changed', () => {
            settings.set_string('city-slug', coordsRow.get_text());
        });
        cityGroup.add(coordsRow);

        const refreshGroup = new Adw.PreferencesGroup({
            title: 'Actualisation',
            description: 'Données fournies gratuitement par Open-Meteo (modèle CAMS, sans clé API).',
        });
        page.add(refreshGroup);

        const intervalRow = new Adw.SpinRow({
            title: 'Actualisation (minutes)',
            subtitle: 'Intervalle entre deux requêtes',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 360,
                step_increment: 5,
                value: settings.get_int('refresh-interval'),
            }),
        });
        intervalRow.connect('notify::value', () => {
            settings.set_int('refresh-interval', intervalRow.get_value());
        });
        refreshGroup.add(intervalRow);
    }
}
