-- Add date_naissance column to utilisateurs table
ALTER TABLE utilisateurs ADD COLUMN date_naissance DATE DEFAULT NULL;

-- In case you need to remove the column (rollback)
-- ALTER TABLE utilisateurs DROP COLUMN date_naissance;
