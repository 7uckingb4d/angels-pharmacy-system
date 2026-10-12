# Angel's Pharmacy Online System
This is the official repository of the Angel's Pharmacy Online System.

## Local development setup
The following are the instructions for setting up a local development environment.

1. Install **Express.js** version 5.2.1 in the root folder of the repository.
```
npm install express@5.2.1
```

2. Install the **Supabase JS** (version 2.117.2) client dependency for connecting the backend to the database.
```
npm install @supabase/supabase-js@2.117.2
```

3. Install the **Supabase** (version 2.120.0) development dependency to allow local development with a local database.
```
npm install supabase@2.120.0
```

You will need to install the **Supabase CLI** to your machine to allow concrete development of the system's database.
Refer to their [official documentation](https://supabase.com/docs/guides/local-development) for installation. You will
also need to install a container engine such as Docker or Podman, however **Docker** is strongly recommended.

## Starting the local server
To run the local server in the local development environment, follow these instructions:

1. Start Docker and run the following command at the root folder of the repository:
```
npx supabase start
```

2. Start Node.js run configuration via:
```
npm run debug
```

3. Open the website at `localhost:3000`.
