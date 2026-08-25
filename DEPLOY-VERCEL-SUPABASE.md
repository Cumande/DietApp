# Déploiement Vercel + Supabase

## 1. Créer la table dans Supabase

Dans Supabase, ouvre **SQL Editor**, colle le contenu de `supabase/schema.sql`, puis lance la requête.

## 2. Ajouter les variables dans Vercel

Dans ton projet Vercel :

`Settings` > `Environment Variables`

Ajoute :

```txt
SUPABASE_URL=https://vkuxvwmnddlshvomyyvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ta_cle_service_role_supabase
```

La clé `SUPABASE_SERVICE_ROLE_KEY` se trouve dans Supabase :

`Project Settings` > `API Keys` > `service_role`

Ne la mets jamais dans `index.html` ou GitHub.

## 3. Réglages Vercel

Pour ce projet :

```txt
Framework Preset: Other
Build Command: npm run build
Output Directory: .
Install Command: laisser vide
```

## 4. Redéployer

Après avoir poussé ces fichiers sur GitHub, lance un nouveau déploiement Vercel.

La synchronisation est automatique, sans PIN. Le badge `Sync` confirme la connexion et permet aussi de forcer une synchronisation en cliquant dessus.

Si le badge affiche `Réessayer`, clique dessus pour voir le détail de l'erreur au survol. Vérifie surtout que `SUPABASE_SERVICE_ROLE_KEY` est bien définie pour l'environnement `Production`, puis redéploie le projet.
