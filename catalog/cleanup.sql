-- ============================================================================
-- Goalpost: Database Cleanup & Fresh Start
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Replace YOUR_CATALOG_NAME with your catalog name
-- 2. Run this in Databricks SQL Editor to reset all data
-- ============================================================================

USE CATALOG YOUR_CATALOG_NAME;
USE SCHEMA prod;

-- ============================================================================
-- Clear all data (fresh start)
-- ============================================================================
-- Delete in order to respect relationships
DELETE FROM tasks;
DELETE FROM milestones;
DELETE FROM goals;
DELETE FROM users;

-- ============================================================================
-- Verify tables are empty
-- ============================================================================
SELECT 'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 'goals', COUNT(*) FROM goals
UNION ALL
SELECT 'milestones', COUNT(*) FROM milestones
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks;

-- ============================================================================
-- Done! Your database is now clean and ready for testing.
-- ============================================================================
