BEGIN;

INSERT INTO nigeria_states(name, code) VALUES
('Abia','AB'),('Adamawa','AD'),('Akwa Ibom','AK'),('Anambra','AN'),('Bauchi','BA'),('Bayelsa','BY'),('Benue','BE'),('Borno','BO'),('Cross River','CR'),('Delta','DE'),('Ebonyi','EB'),('Edo','ED'),('Ekiti','EK'),('Enugu','EN'),('Gombe','GO'),('Imo','IM'),('Jigawa','JI'),('Kaduna','KD'),('Kano','KN'),('Katsina','KT'),('Kebbi','KE'),('Kogi','KO'),('Kwara','KW'),('Lagos','LA'),('Nasarawa','NA'),('Niger','NI'),('Ogun','OG'),('Ondo','ON'),('Osun','OS'),('Oyo','OY'),('Plateau','PL'),('Rivers','RI'),('Sokoto','SO'),('Taraba','TA'),('Yobe','YO'),('Zamfara','ZA'),('Federal Capital Territory','FC')
ON CONFLICT(name) DO UPDATE SET code=EXCLUDED.code;

COMMIT;
