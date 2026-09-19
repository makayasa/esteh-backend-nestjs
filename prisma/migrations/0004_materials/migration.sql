CREATE TABLE "Material" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantityScale" INTEGER NOT NULL CHECK ("quantityScale" BETWEEN 0 AND 3),
  "active" BOOLEAN NOT NULL DEFAULT true
);

-- Native DB invariant: no update can reinterpret existing quantities.
CREATE FUNCTION material_fixed_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."unit" <> OLD."unit" OR NEW."quantityScale" <> OLD."quantityScale" THEN
    RAISE EXCEPTION 'Material unit and quantity scale are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER material_fixed_unit BEFORE UPDATE ON "Material"
FOR EACH ROW EXECUTE FUNCTION material_fixed_unit();
