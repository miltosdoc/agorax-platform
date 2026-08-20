-- Add mergedInto column to communities table
-- This tracks which community a merged community was merged into

ALTER TABLE communities ADD COLUMN merged_into INTEGER REFERENCES communities(id);

-- Add index for faster lookups of merged communities
CREATE INDEX idx_communities_merged_into ON communities(merged_into);

-- Comment: merged_into is NULL for active communities, 
-- set to target community ID when merged