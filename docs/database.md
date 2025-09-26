## Database Setup and Migrations

This project uses PostgreSQL as its database. Database schema changes are managed through SQL migration files located in the `db-init/` directory.

### Applying Migrations

To set up the database and apply all migrations, follow these steps:

1.  **Ensure PostgreSQL is running** and you have a database created for this project (e.g., `pwnchat_db`).

2.  **Ensure your database connection details are configured** in the backend's `.env` file (e.g., `DATABASE_URL`).

3.  **Execute the migration files in order** using a PostgreSQL client (like `psql`). Navigate to the project's root directory in your terminal.

    ```bash
    # Example using psql (replace with your database connection details)
    # psql -U your_username -d your_database_name -h your_host -p your_port -f db-init/001_init.sql
    # psql -U your_username -d your_database_name -h your_host -p your_port -f db-init/002_create_one_time_prekeys.sql
    # psql -U your_username -d your_database_name -h your_host -p your_port -f db-init/003_create_messages.sql
    # psql -U your_username -d your_database_name -h your_host -p your_port -f db-init/004_create_sessions_table.sql

    # A more robust way to run all migrations in order:
    for f in db-init/*.sql; do
        echo "Applying migration: $f"
        psql -U <your_db_user> -d <your_db_name> -h <your_db_host> -p <your_db_port> -f "$f"
    done
    ```

    **Note:** Replace `<your_db_user>`, `<your_db_name>`, `<your_db_host>`, and `<your_db_port>` with your actual PostgreSQL connection details.

### Adding New Migrations

When you need to make changes to the database schema:

1.  Create a new SQL file in the `db-init/` directory.
2.  Name the file with a sequential prefix (e.g., `005_add_new_table.sql`) to ensure correct ordering.
3.  Write the SQL statements for your schema changes in this file.
4.  Apply the new migration using the steps above.

