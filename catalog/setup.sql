-- ============================================================================
-- Goalpost: Delta Lake Schema Setup
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Replace YOUR_CATALOG_NAME with your catalog name
-- 2. Run this in Databricks SQL Editor or a notebook
--
-- Example:
--   Find & Replace: YOUR_CATALOG_NAME -> my_company_catalog
-- ============================================================================

-- Create catalog (requires CREATE CATALOG privilege)
-- Skip if using an existing catalog
-- CREATE CATALOG IF NOT EXISTS YOUR_CATALOG_NAME;

USE CATALOG YOUR_CATALOG_NAME;

-- Create schema
CREATE SCHEMA IF NOT EXISTS prod;
USE SCHEMA prod;

-- ============================================================================
-- USERS TABLE
-- Stores user accounts (auto-created on SSO login)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    user_id STRING NOT NULL,
    email STRING NOT NULL,
    display_name STRING,
    avatar_url STRING,
    timezone STRING,
    preferences MAP<STRING, STRING>,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) USING DELTA;

-- ============================================================================
-- GOALS TABLE
-- Stores user goals with timeline and progress
-- ============================================================================
CREATE TABLE IF NOT EXISTS goals (
    goal_id STRING NOT NULL,
    user_id STRING NOT NULL,
    title STRING NOT NULL,
    description STRING,
    target_count INT,
    current_count INT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    priority INT,
    status STRING,
    color STRING,
    tags ARRAY<STRING>,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    completed_at TIMESTAMP
) USING DELTA;

-- ============================================================================
-- MILESTONES TABLE
-- Stores goal milestones (optional breakdown)
-- ============================================================================
CREATE TABLE IF NOT EXISTS milestones (
    milestone_id STRING NOT NULL,
    goal_id STRING NOT NULL,
    user_id STRING,
    title STRING NOT NULL,
    description STRING,
    target_count INT,
    due_date DATE,
    completed BOOLEAN,
    completed_at TIMESTAMP,
    sort_order INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) USING DELTA;

-- ============================================================================
-- TASKS TABLE
-- Stores weekly tasks (AI-generated from goals)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    task_id STRING NOT NULL,
    goal_id STRING NOT NULL,
    milestone_id STRING,
    user_id STRING NOT NULL,
    title STRING NOT NULL,
    description STRING,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    year_week STRING NOT NULL,
    target_count INT,
    completed_count INT,
    status STRING,
    priority INT,
    sort_order INT,
    assignee STRING,
    notes STRING,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    completed_at TIMESTAMP
) USING DELTA;

-- ============================================================================
-- Verify tables created
-- ============================================================================
SHOW TABLES;
