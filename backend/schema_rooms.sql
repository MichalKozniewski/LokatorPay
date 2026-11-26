-- FR-03, NFR-03: Tabela pokoi z walidacją dodatniego metrażu oraz przypisaniem lokatora
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    area_m2 NUMERIC(6, 2) NOT NULL CHECK (area_m2 > 0),
    tenant_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_apartment_id ON rooms(apartment_id);

-- Widok / zapytanie sumujące metraż całkowity mieszkania (NFR-03)
CREATE VIEW apartment_area_summary AS
SELECT
    apartment_id,
    COUNT(id) AS room_count,
    COALESCE(SUM(area_m2), 0.00) AS total_area_m2
FROM rooms
GROUP BY apartment_id;