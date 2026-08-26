/**
 * Nom de la variable globale qui porte la configuration publique dans la
 * page. Isolé dans son propre module : le client du navigateur et le
 * composant serveur qui l'injecte en ont tous deux besoin, et faire
 * transiter cette constante par un module marqué `server-only` ferait
 * échouer le build.
 */
export const CLE_GLOBALE = '__CRM_ALTITUDE__'
