# Déploiement Vercel + Supabase

## Etat de cette mise a jour

Cette version utilise une connexion privee par code email, sans PIN quotidien.
Ne pas la promouvoir en production avant d'avoir configure et teste l'email
proprietaire. La version publique precedente reste accessible entre-temps.

Le 2 octobre 2026, `supabase/secure-sync.sql` a ete applique au projet existant.
La ligne `diet_90_97` n'a pas ete remplacee. Les tests SQL de fusion, conflit,
suppression et atomicite ont ete executes dans des transactions annulees.

## Configuration initiale

Pour un nouveau projet uniquement, executer `supabase/schema.sql`, puis
`supabase/secure-sync.sql`. Ne jamais reinitialiser la ligne existante pour
resoudre une panne de synchronisation.

Variables Vercel, dans les environnements utilises :

```txt
SUPABASE_URL=https://vkuxvwmnddlshvomyyvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=cle_secrete_cote_serveur
OPENAI_API_KEY=cle_secrete_pour_estimer_les_repas
```

Aucune cle secrete dans `index.html` ni dans GitHub.

## Activer la connexion privee

1. Confirmer avec Cee l'adresse email autorisee.
2. Inserer cette adresse dans `public.diet_owner` (singleton=true).
   Utiliser une requete parametree ou le Table Editor, pas une adresse supposee.
3. Dans Supabase Authentication, activer le fournisseur Email. Dans le modele
   Magic Link, afficher `{{ .Token }}` pour envoyer le code OTP attendu par
   l'application. Le modele par defaut envoie un lien, pas ce code.
4. Verifier l'envoi reel. Le service email par defaut peut restreindre les
   destinataires aux membres de l'organisation. Configurer un SMTP autorise
   si necessaire, sans souscrire automatiquement une offre payante.
5. Tester sur un deploiement Preview avec les variables serveur configurees :
   connexion, actualisation, renouvellement de session, puis un deuxieme
   navigateur. Les cookies sont HttpOnly/Secure ; le refresh token est conserve
   jusqu'a 30 jours sur l'appareil.
6. Promouvoir seulement apres validation. Proteger ou supprimer les anciens
   deploiements Vercel publics : leur ancienne API peut encore acceder a la
   meme base. S'il faut renouveler une cle serveur, mettre a jour et tester la
   production avant de revoquer l'ancienne cle.

Les tables de donnees et du proprietaire ont RLS active sans acces public.
L'avis Supabase `rls_enabled_no_policy` est intentionnel ici : seul le serveur
avec la cle service_role accede a ces tables.

## Reglages Vercel

```txt
Framework Preset: Other
Build Command: npm run build
Output Directory: .
Install Command: laisser vide
```

Un push sur la branche de production declenche normalement le deploiement.
Utiliser une branche separee tant que la connexion email n'a pas ete testee.

## Synchronisation

- Sauvegarde automatique apres modification ; les changements non envoyes
  restent dans le navigateur en cas de coupure.
- Relecture au retour dans l'application, sur clic Synced et toutes les
  90 secondes si la page est visible et qu'aucun champ n'est en cours de saisie.
- Les reponses inchangees utilisent ETag/304, sans transferer tout l'historique.
- Chaque sauvegarde envoie seulement les champs modifies. Supabase applique
  tout le lot dans une transaction avec verrouillage et comparaison de la
  valeur precedente. Un autre champ peut changer sans etre ecrase.
- En cas de conflit, les modifications locales restent en attente. Review
  propose de telecharger une copie puis de prendre la version du serveur.
  Cette copie JSON n'est pas automatiquement reimportee.
- Les anciennes modifications en attente sans valeur de reference doivent
  etre revues explicitement, jamais envoyees comme remplacement complet.
- Les donnees deja recues restent consultables hors ligne. Sign out efface
  les copies locales de cet appareil apres confirmation, pas les donnees cloud.

## Verification avant publication

`npm test` couvre les repas, poids, seances, conflits entre appareils,
rechargement hors ligne, historique des charges, authentification et API IA.
`npm run build` valide la preparation statique.

Le controle visuel local utilise des donnees fictives, pas les vraies entrees.
La livraison effective de l'email et le parcours prive sur Vercel restent a
verifier apres configuration du proprietaire.
