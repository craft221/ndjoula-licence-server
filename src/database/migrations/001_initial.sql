CREATE TABLE IF NOT EXISTS licences (
  id SERIAL PRIMARY KEY,
  licence_key VARCHAR(19) UNIQUE NOT NULL,
  machine_id VARCHAR(255),
  client_name VARCHAR(255) DEFAULT '',
  phone VARCHAR(50) DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  activation_date TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licences_key ON licences(licence_key);
CREATE INDEX IF NOT EXISTS idx_licences_status ON licences(status);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  licence_id INTEGER REFERENCES licences(id),
  paydunya_token VARCHAR(255),
  amount INTEGER NOT NULL,
  payment_method VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  customer_phone VARCHAR(50) DEFAULT '',
  paydunya_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_licence ON payments(licence_id);
CREATE INDEX IF NOT EXISTS idx_payments_token ON payments(paydunya_token);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
