-- ============================================================================
-- Goalpost: Initialize Tables
-- ============================================================================
-- This SQL runs during DAB deployment to ensure tables exist.
-- Uses variables: ${catalog_name} and ${schema_name}
-- ============================================================================

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS ${catalog_name}.${schema_name};

-- Switch to the schema
USE CATALOG ${catalog_name};
USE SCHEMA ${schema_name};

-- ============================================================================
-- USERS TABLE
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
) USING DELTA
COMMENT 'User accounts - auto-created on SSO login';

-- ============================================================================
-- GOALS TABLE
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
) USING DELTA
COMMENT 'User goals with timeline and progress';

-- ============================================================================
-- MILESTONES TABLE
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
) USING DELTA
COMMENT 'Goal milestones for tracking progress';

-- ============================================================================
-- TASKS TABLE
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
) USING DELTA
COMMENT 'Weekly tasks - AI-generated from goals';

