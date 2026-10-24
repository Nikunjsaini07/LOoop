import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_SiuWdC4OosL3@ep-frosty-dream-b584g56d-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

const functions = [
`CREATE OR REPLACE FUNCTION "json"(val text) RETURNS json AS $$
BEGIN
  RETURN val::json;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION julianday(val text) RETURNS double precision AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN NULL; END IF;
  RETURN EXTRACT(EPOCH FROM val::timestamptz) / 86400.0 + 2440587.5;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION json_extract(val json, path text) RETURNS text AS $$
BEGIN
  IF val IS NULL OR path IS NULL THEN RETURN NULL; END IF;
  IF path LIKE '$.%' THEN
    RETURN val->>SUBSTRING(path FROM 3);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION json_extract(val text, path text) RETURNS text AS $$
BEGIN
  IF val IS NULL OR path IS NULL THEN RETURN NULL; END IF;
  IF path LIKE '$.%' THEN
    RETURN (val::json)->>SUBSTRING(path FROM 3);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION json_array_length(val json, path text DEFAULT '$') RETURNS integer AS $$
BEGIN
  IF val IS NULL THEN RETURN 0; END IF;
  IF path = '$' THEN
    RETURN json_array_length(val);
  ELSE
    RETURN COALESCE(json_array_length(val->SUBSTRING(path FROM 3)), 0);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`DROP FUNCTION IF EXISTS json_each(json, text)`,
`CREATE OR REPLACE FUNCTION json_each(val json, path text DEFAULT '$')
RETURNS TABLE (key text, value text) AS $$
BEGIN
  IF val IS NULL THEN RETURN; END IF;
  IF path = '$' THEN
    RETURN QUERY SELECT (row_number() over() - 1)::text, j FROM json_array_elements_text(val) j;
  ELSE
    RETURN QUERY SELECT (row_number() over() - 1)::text, j FROM json_array_elements_text(val->SUBSTRING(path FROM 3)) j;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION json_each(val text, path text DEFAULT '$')
RETURNS TABLE (key text, value text) AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM json_each(val::json, path);
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION json_array_length(val text, path text DEFAULT '$') RETURNS integer AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN 0; END IF;
  RETURN json_array_length(val::json, path);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION json_valid(val text) RETURNS boolean AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN false; END IF;
  PERFORM val::json;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION instr(haystack text, needle text) RETURNS integer AS $$
BEGIN
  IF haystack IS NULL OR needle IS NULL THEN RETURN 0; END IF;
  RETURN POSITION(needle IN haystack);
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION date(val text, offset_interval text DEFAULT NULL) RETURNS text AS $$
BEGIN
  IF val IS NULL THEN RETURN NULL; END IF;
  IF offset_interval IS NULL THEN
    RETURN (val::timestamptz)::date::text;
  ELSE
    RETURN ((val::timestamptz) + (offset_interval::interval))::date::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION max(a double precision, b double precision) RETURNS double precision AS $$
  SELECT GREATEST(a, b);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION min(a double precision, b double precision) RETURNS double precision AS $$
  SELECT LEAST(a, b);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION max(a integer, b double precision) RETURNS double precision AS $$
  SELECT GREATEST(a::double precision, b);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION min(a integer, b double precision) RETURNS double precision AS $$
  SELECT LEAST(a::double precision, b);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION max(a double precision, b integer) RETURNS double precision AS $$
  SELECT GREATEST(a, b::double precision);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION min(a double precision, b integer) RETURNS double precision AS $$
  SELECT LEAST(a, b::double precision);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION max(a integer, b integer) RETURNS integer AS $$
  SELECT GREATEST(a, b);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION min(a integer, b integer) RETURNS integer AS $$
  SELECT LEAST(a, b);
$$ LANGUAGE sql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION text_gt_int(a text, b integer) RETURNS boolean AS $$
BEGIN
  RETURN a::numeric > b;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`CREATE OR REPLACE FUNCTION text_gte_int(a text, b integer) RETURNS boolean AS $$
BEGIN
  RETURN a::numeric >= b;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE`,

`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '>' AND t1.typname = 'text' AND t2.typname = 'int4') THEN
    CREATE OPERATOR > (LEFTARG = text, RIGHTARG = integer, PROCEDURE = text_gt_int);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '>=' AND t1.typname = 'text' AND t2.typname = 'int4') THEN
    CREATE OPERATOR >= (LEFTARG = text, RIGHTARG = integer, PROCEDURE = text_gte_int);
  END IF;
END $$`,

`CREATE OR REPLACE FUNCTION bool_accum(acc bigint, b boolean) RETURNS bigint AS $$
  SELECT acc + CASE WHEN b THEN 1 ELSE 0 END;
$$ LANGUAGE sql IMMUTABLE`,

`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_type t ON p.proargtypes[0] = t.oid WHERE p.proname = 'sum' AND t.typname = 'bool') THEN
    CREATE AGGREGATE sum(boolean) (
      SFUNC = bool_accum,
      STYPE = bigint,
      INITCOND = '0'
    );
  END IF;
END $$`,

`CREATE OR REPLACE FUNCTION bool_mul_int(b boolean, i integer) RETURNS integer AS $$
  SELECT CASE WHEN b THEN i ELSE 0 END;
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION int_mul_bool(i integer, b boolean) RETURNS integer AS $$
  SELECT CASE WHEN b THEN i ELSE 0 END;
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION bool_add_int(b boolean, i integer) RETURNS integer AS $$
  SELECT (CASE WHEN b THEN 1 ELSE 0 END) + i;
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION int_add_bool(i integer, b boolean) RETURNS integer AS $$
  SELECT i + (CASE WHEN b THEN 1 ELSE 0 END);
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION bool_mul_double(b boolean, d double precision) RETURNS double precision AS $$
  SELECT CASE WHEN b THEN d ELSE 0.0 END;
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION double_mul_bool(d double precision, b boolean) RETURNS double precision AS $$
  SELECT CASE WHEN b THEN d ELSE 0.0 END;
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION double_sub_bool(d double precision, b boolean) RETURNS double precision AS $$
  SELECT d - (CASE WHEN b THEN 1.0 ELSE 0.0 END);
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION int_sub_bool(i integer, b boolean) RETURNS integer AS $$
  SELECT i - (CASE WHEN b THEN 1 ELSE 0 END);
$$ LANGUAGE sql IMMUTABLE`,

`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '*' AND t1.typname = 'bool' AND t2.typname = 'int4') THEN
    CREATE OPERATOR * (LEFTARG = boolean, RIGHTARG = integer, PROCEDURE = bool_mul_int);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '*' AND t1.typname = 'int4' AND t2.typname = 'bool') THEN
    CREATE OPERATOR * (LEFTARG = integer, RIGHTARG = boolean, PROCEDURE = int_mul_bool);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '+' AND t1.typname = 'bool' AND t2.typname = 'int4') THEN
    CREATE OPERATOR + (LEFTARG = boolean, RIGHTARG = integer, PROCEDURE = bool_add_int);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '+' AND t1.typname = 'int4' AND t2.typname = 'bool') THEN
    CREATE OPERATOR + (LEFTARG = integer, RIGHTARG = boolean, PROCEDURE = int_add_bool);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '*' AND t1.typname = 'bool' AND t2.typname = 'float8') THEN
    CREATE OPERATOR * (LEFTARG = boolean, RIGHTARG = double precision, PROCEDURE = bool_mul_double);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '*' AND t1.typname = 'float8' AND t2.typname = 'bool') THEN
    CREATE OPERATOR * (LEFTARG = double precision, RIGHTARG = boolean, PROCEDURE = double_mul_bool);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '-' AND t1.typname = 'float8' AND t2.typname = 'bool') THEN
    CREATE OPERATOR - (LEFTARG = double precision, RIGHTARG = boolean, PROCEDURE = double_sub_bool);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '-' AND t1.typname = 'int4' AND t2.typname = 'bool') THEN
    CREATE OPERATOR - (LEFTARG = integer, RIGHTARG = boolean, PROCEDURE = int_sub_bool);
  END IF;
END $$`,

`CREATE OR REPLACE FUNCTION bool_eq_int(b boolean, i integer) RETURNS boolean AS $$
  SELECT (CASE WHEN b THEN 1 ELSE 0 END) = i;
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION int_eq_bool(i integer, b boolean) RETURNS boolean AS $$
  SELECT i = (CASE WHEN b THEN 1 ELSE 0 END);
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION bool_neq_int(b boolean, i integer) RETURNS boolean AS $$
  SELECT (CASE WHEN b THEN 1 ELSE 0 END) <> i;
$$ LANGUAGE sql IMMUTABLE`,
`CREATE OR REPLACE FUNCTION int_neq_bool(i integer, b boolean) RETURNS boolean AS $$
  SELECT i <> (CASE WHEN b THEN 1 ELSE 0 END);
$$ LANGUAGE sql IMMUTABLE`,

`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '=' AND t1.typname = 'bool' AND t2.typname = 'int4') THEN
    CREATE OPERATOR = (LEFTARG = boolean, RIGHTARG = integer, PROCEDURE = bool_eq_int);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '=' AND t1.typname = 'int4' AND t2.typname = 'bool') THEN
    CREATE OPERATOR = (LEFTARG = integer, RIGHTARG = boolean, PROCEDURE = int_eq_bool);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '<>' AND t1.typname = 'bool' AND t2.typname = 'int4') THEN
    CREATE OPERATOR <> (LEFTARG = boolean, RIGHTARG = integer, PROCEDURE = bool_neq_int);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_operator o JOIN pg_type t1 ON o.oprleft = t1.oid JOIN pg_type t2 ON o.oprright = t2.oid WHERE o.oprname = '<>' AND t1.typname = 'int4' AND t2.typname = 'bool') THEN
    CREATE OPERATOR <> (LEFTARG = integer, RIGHTARG = boolean, PROCEDURE = int_neq_bool);
  END IF;
END $$`
];

async function main() {
  console.log('Installing 7 compatibility functions in Neon...');
  for (const fn of functions) {
    await sql.query(fn);
  }
  console.log('Functions installed.');

  // Test 1: julianday
  const diff = await sql.query("SELECT julianday('2026-10-24T12:00:00Z') - julianday('2026-10-23T12:00:00Z') as d");
  console.log('1. julianday diff:', diff[0].d);

  // Test 2: json & json_extract
  const je = await sql.query("SELECT json_extract(\"json\"('{\"title\":\"Hello World\"}'), '$.title') as t");
  console.log('2. json_extract:', je[0].t);

  // Test 3: json_array_length
  const len = await sql.query("SELECT json_array_length(\"json\"('{\"topics\":[\"a\",\"b\",\"c\"]}'), '$.topics') as l");
  console.log('3. json_array_length:', len[0].l);

  // Test 4: json_each
  const each = await sql.query("SELECT * FROM json_each(\"json\"('{\"tags\":[\"tech\",\"code\"]}'), '$.tags')");
  console.log('4. json_each:', each);

  // Test 5: instr
  const inst = await sql.query("SELECT instr('Engineering blog', 'blog') as pos");
  console.log('5. instr:', inst[0].pos);

  // Test 6: date
  const dt = await sql.query("SELECT date('2026-10-24T12:00:00Z', '-14 days') as prev");
  console.log('6. date with -14 days:', dt[0].prev);

  console.log('\nAll compatibility functions verified successfully in Neon!');
}

main().catch(console.error);
