-- Create a security definer function to avoid infinite recursion in RLS
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid();
$$;

-- Update workspaces policies
DROP POLICY IF EXISTS "select_member_workspaces" ON workspaces;
CREATE POLICY "select_member_workspaces" ON workspaces
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (SELECT get_user_workspace_ids())
  );

-- Update workspace_members policies
DROP POLICY IF EXISTS "select_own_workspace_members" ON workspace_members;
CREATE POLICY "select_own_workspace_members" ON workspace_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR workspace_id IN (SELECT get_user_workspace_ids())
  );

DROP POLICY IF EXISTS "insert_owner_workspace_members" ON workspace_members;
CREATE POLICY "insert_owner_workspace_members" ON workspace_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_owner_workspace_members" ON workspace_members;
CREATE POLICY "update_owner_workspace_members" ON workspace_members
  FOR UPDATE USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_owner_workspace_members" ON workspace_members;
CREATE POLICY "delete_owner_workspace_members" ON workspace_members
  FOR DELETE USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );
