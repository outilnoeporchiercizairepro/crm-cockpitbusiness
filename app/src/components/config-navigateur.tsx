import { configPublique } from '@/lib/config-publique'
import { CLE_GLOBALE } from '@/lib/cle-globale'

/**
 * Dépose la configuration publique dans la page, avant tout script de
 * l'application. Ces deux valeurs partent de toute façon dans le navigateur
 * — c'est leur raison d'être — donc les exposer ici n'ajoute aucun risque.
 * La clé de service, elle, ne passe jamais par là.
 */
export function ConfigNavigateur() {
  const { url, cleAnon } = configPublique()

  // `<` est échappé : sans ça, une valeur contenant « </script> » couperait
  // la balise. Ces valeurs viennent de l'environnement, mais un échappement
  // systématique coûte moins cher qu'une confiance mal placée.
  const charge = JSON.stringify({ url, cleAnon }).replace(/</g, '\\u003c')

  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: `window.${CLE_GLOBALE}=${charge}` }}
    />
  )
}
