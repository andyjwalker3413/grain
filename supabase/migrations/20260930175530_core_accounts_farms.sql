/*
# Accounts, farms, members and audit log

Plain English: every person gets a profile; every farm has members with a role
(owner, member, adviser). Farm data is only visible to that farm's members.
Every change to farms and memberships is written to an append-only audit log.
Each new user can load one "Downland Farm" demo farm (synthetic data).

1. New tables
- profiles: user_id (pk, = auth user), full_name, created_at
- farms: id, name, county, total_ha, finance_rate, is_demo, created_by, created_at, updated_at
- farm_members: farm_id, user_id, role (owner|member|adviser), created_at
- audit_log: id, farm_id, actor, table_name, row_id, action, before, after, at

2. Helper functions (security definer, fixed search_path)
- is_farm_member(farm_id), farm_role(farm_id), can_edit_farm(farm_id)
- create_demo_farm(): creates the caller's Downland Farm once, returns its id

3. Security
- RLS on every table, one policy per action, signed-in users only.
- farms: members read, owner edits/deletes, any signed-in user may create (becomes owner).
- farm_members: members read; owner adds/changes/removes; last owner cannot be removed.
- audit_log: members read their farm's history; nobody can write or edit directly.
- profiles: own row read/edit; names of people who share a farm are readable.

4. Notes
- Admin/support access is not included yet (planned for later in Stage 1).
*/

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  county text NOT NULL DEFAULT '',
  total_ha numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_ha >= 0),
  finance_rate numeric(6,4) NOT NULL DEFAULT 0.06 CHECK (finance_rate >= 0 AND finance_rate < 1),
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farm_members (
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','member','adviser')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, user_id)
);
CREATE INDEX IF NOT EXISTS farm_members_user_idx ON farm_members(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE,
  actor uuid,
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_farm_idx ON audit_log(farm_id, at DESC);

CREATE OR REPLACE FUNCTION public.is_farm_member(p_farm uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.farm_members m WHERE m.farm_id = p_farm AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.farm_role(p_farm uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.role FROM public.farm_members m WHERE m.farm_id = p_farm AND m.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_edit_farm(p_farm uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.farm_members m WHERE m.farm_id = p_farm AND m.user_id = auth.uid() AND m.role IN ('owner','member'));
$$;

REVOKE ALL ON FUNCTION public.is_farm_member(uuid), public.farm_role(uuid), public.can_edit_farm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_farm_member(uuid), public.farm_role(uuid), public.can_edit_farm(uuid) TO authenticated;

-- Creator becomes owner
CREATE OR REPLACE FUNCTION public.add_farm_creator_as_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.farm_members(farm_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.add_farm_creator_as_owner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS farms_add_owner ON farms;
CREATE TRIGGER farms_add_owner AFTER INSERT ON farms FOR EACH ROW EXECUTE FUNCTION public.add_farm_creator_as_owner();

-- Keep at least one owner
CREATE OR REPLACE FUNCTION public.guard_last_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner')
     AND EXISTS (SELECT 1 FROM public.farms f WHERE f.id = OLD.farm_id)
     AND NOT EXISTS (SELECT 1 FROM public.farm_members m WHERE m.farm_id = OLD.farm_id AND m.role = 'owner' AND m.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'A farm must keep at least one owner';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_last_owner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS farm_members_last_owner ON farm_members;
CREATE TRIGGER farm_members_last_owner BEFORE UPDATE OR DELETE ON farm_members FOR EACH ROW EXECUTE FUNCTION public.guard_last_owner();

-- Audit trigger
CREATE OR REPLACE FUNCTION public.write_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_farm uuid := CASE WHEN TG_TABLE_NAME = 'farms' THEN (v_row->>'id')::uuid ELSE (v_row->>'farm_id')::uuid END;
BEGIN
  INSERT INTO public.audit_log(farm_id, actor, table_name, row_id, action, before, after)
  VALUES (
    CASE WHEN TG_TABLE_NAME = 'farms' AND TG_OP = 'DELETE' THEN NULL ELSE v_farm END,
    auth.uid(), TG_TABLE_NAME, COALESCE(v_row->>'id', v_row->>'user_id'), lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.write_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS farms_audit ON farms;
CREATE TRIGGER farms_audit AFTER INSERT OR UPDATE OR DELETE ON farms FOR EACH ROW EXECUTE FUNCTION public.write_audit();
DROP TRIGGER IF EXISTS farm_members_audit ON farm_members;
CREATE TRIGGER farm_members_audit AFTER INSERT OR UPDATE OR DELETE ON farm_members FOR EACH ROW EXECUTE FUNCTION public.write_audit();

-- Profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles(user_id, full_name)
  VALUES (NEW.id, left(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 120))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Demo farm
CREATE OR REPLACE FUNCTION public.create_demo_farm()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT f.id INTO v_id FROM public.farms f WHERE f.created_by = auth.uid() AND f.is_demo LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.farms(name, county, total_ha, finance_rate, is_demo, created_by)
  VALUES ('Downland Farm', 'Hampshire', 420, 0.06, true, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_demo_farm() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_demo_farm() TO authenticated;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM farm_members m WHERE m.user_id = profiles.user_id AND public.is_farm_member(m.farm_id)));
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "farms_select" ON farms;
CREATE POLICY "farms_select" ON farms FOR SELECT TO authenticated USING (public.is_farm_member(id) OR created_by = auth.uid());
DROP POLICY IF EXISTS "farms_insert" ON farms;
CREATE POLICY "farms_insert" ON farms FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND is_demo = false);
DROP POLICY IF EXISTS "farms_update" ON farms;
CREATE POLICY "farms_update" ON farms FOR UPDATE TO authenticated USING (public.farm_role(id) = 'owner') WITH CHECK (public.farm_role(id) = 'owner');
DROP POLICY IF EXISTS "farms_delete" ON farms;
CREATE POLICY "farms_delete" ON farms FOR DELETE TO authenticated USING (public.farm_role(id) = 'owner');

DROP POLICY IF EXISTS "farm_members_select" ON farm_members;
CREATE POLICY "farm_members_select" ON farm_members FOR SELECT TO authenticated USING (public.is_farm_member(farm_id));
DROP POLICY IF EXISTS "farm_members_insert" ON farm_members;
CREATE POLICY "farm_members_insert" ON farm_members FOR INSERT TO authenticated WITH CHECK (public.farm_role(farm_id) = 'owner');
DROP POLICY IF EXISTS "farm_members_update" ON farm_members;
CREATE POLICY "farm_members_update" ON farm_members FOR UPDATE TO authenticated USING (public.farm_role(farm_id) = 'owner') WITH CHECK (public.farm_role(farm_id) = 'owner');
DROP POLICY IF EXISTS "farm_members_delete" ON farm_members;
CREATE POLICY "farm_members_delete" ON farm_members FOR DELETE TO authenticated USING (public.farm_role(farm_id) = 'owner');

DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT TO authenticated USING (farm_id IS NOT NULL AND public.is_farm_member(farm_id));
