export interface AcademicOption {
  label: string;
  category: string;
  keywords?: string;
}

export const GHANA_UNIVERSITIES: AcademicOption[] = [
  // Public Traditional & Specialized Universities
  {
    label: 'University of Ghana (UG)',
    category: 'Public University',
    keywords: 'Legon Accra Korle-Bu',
  },
  {
    label: 'Kwame Nkrumah University of Science and Technology (KNUST)',
    category: 'Public University',
    keywords: 'Kumasi Tech Engineering Science',
  },
  {
    label: 'University of Cape Coast (UCC)',
    category: 'Public University',
    keywords: 'Cape Coast Central Education',
  },
  {
    label: 'University of Education, Winneba (UEW)',
    category: 'Public University',
    keywords: 'Winneba Mampong Ajumako',
  },
  {
    label: 'University for Development Studies (UDS)',
    category: 'Public University',
    keywords: 'Tamale Nyankpala Northern',
  },
  {
    label: 'University of Mines and Technology (UMaT)',
    category: 'Public University',
    keywords: 'Tarkwa Essikado Mining Engineering',
  },
  {
    label: 'University of Health and Allied Sciences (UHAS)',
    category: 'Public University',
    keywords: 'Ho Hohoe Volta Medical Health',
  },
  {
    label: 'University of Energy and Natural Resources (UENR)',
    category: 'Public University',
    keywords: 'Sunyani Dormaa Bono',
  },
  {
    label: 'University of Professional Studies, Accra (UPSA)',
    category: 'Public University',
    keywords: 'Madina East Legon Business Law Accounting',
  },
  {
    label: 'Ghana Communication Technology University (GCTU)',
    category: 'Public University',
    keywords: 'GTUC Tesano Accra Telecom IT Computer',
  },
  {
    label: 'Akenten Appiah-Menka University of Skills Training and Entrepreneurial Development (AAMUSTED)',
    category: 'Public University',
    keywords: 'Kumasi Mampong Technical Vocational',
  },
  {
    label: 'C.K. Tedam University of Technology and Applied Sciences (CKT-UTAS)',
    category: 'Public University',
    keywords: 'Navrongo Upper East',
  },
  {
    label: 'Simon Diedong Dombo University of Business and Integrated Development Studies (SDD-UBIDS)',
    category: 'Public University',
    keywords: 'Wa Upper West Bamahu',
  },
  {
    label: 'University of Environment and Sustainable Development (UESD)',
    category: 'Public University',
    keywords: 'Somanya Eastern Environment',
  },
  {
    label: 'Ghana Institute of Management and Public Administration (GIMPA)',
    category: 'Public University',
    keywords: 'Greenhill Achimota Accra Law Business',
  },
  {
    label: 'University of Media, Arts and Communication (UniMAC)',
    category: 'Public University',
    keywords: 'GIJ NAFTI GIL Media Journalism Film',
  },
  {
    label: 'Ghana Institute of Journalism (UniMAC-GIJ)',
    category: 'Public University',
    keywords: 'Osu Dzorwulu Accra Media Communication',
  },
  {
    label: 'National Film and Television Institute (UniMAC-NAFTI)',
    category: 'Public University',
    keywords: 'Cantonments Film TV Media',
  },
  {
    label: 'Regional Maritime University (RMU)',
    category: 'Specialized Institution',
    keywords: 'Nungua Accra Marine Nautical Engineering',
  },
  {
    label: 'Ghana School of Law',
    category: 'Specialized Institution',
    keywords: 'Makola Legon BL Law',
  },
  {
    label: 'Ghana Armed Forces Command and Staff College (GAFCSC)',
    category: 'Specialized Institution',
    keywords: 'Teshie Accra Defence Security',
  },
  {
    label: 'Ghana Institute of Languages (UniMAC-GIL)',
    category: 'Specialized Institution',
    keywords: 'Accra Kumasi Tamale Translation',
  },

  // Technical Universities (All 10)
  {
    label: 'Accra Technical University (ATU)',
    category: 'Technical University',
    keywords: 'Accra Polytechnic Barnes Road',
  },
  {
    label: 'Kumasi Technical University (KsTU)',
    category: 'Technical University',
    keywords: 'Kumasi Polytechnic Adum',
  },
  {
    label: 'Takoradi Technical University (TTU)',
    category: 'Technical University',
    keywords: 'Takoradi Sekondi Western Polytechnic',
  },
  {
    label: 'Tamale Technical University (TaTU)',
    category: 'Technical University',
    keywords: 'Tamale Northern Polytechnic',
  },
  {
    label: 'Cape Coast Technical University (CCTU)',
    category: 'Technical University',
    keywords: 'Cape Coast Polytechnic',
  },
  {
    label: 'Ho Technical University (HTU)',
    category: 'Technical University',
    keywords: 'Ho Volta Polytechnic',
  },
  {
    label: 'Sunyani Technical University (STU)',
    category: 'Technical University',
    keywords: 'Sunyani Bono Polytechnic',
  },
  {
    label: 'Koforidua Technical University (KTU)',
    category: 'Technical University',
    keywords: 'Koforidua Eastern Polytechnic',
  },
  {
    label: 'Bolgatanga Technical University (BTU)',
    category: 'Technical University',
    keywords: 'Bolga Upper East Sumbrungu Polytechnic',
  },
  {
    label: 'Dr. Hilla Limann Technical University (Wa Technical University)',
    category: 'Technical University',
    keywords: 'WTU Wa Upper West Polytechnic',
  },

  // Chartered & Accredited Private Universities & University Colleges
  {
    label: 'Ashesi University',
    category: 'Private University',
    keywords: 'Berekuso Eastern CS Engineering Business',
  },
  {
    label: 'Academic City University College',
    category: 'Private University',
    keywords: 'Haatso Accra Engineering Robotics IT',
  },
  {
    label: 'Central University',
    category: 'Private University',
    keywords: 'Miotso Tema Dansoman Pharmacy Business Law',
  },
  {
    label: 'Valley View University (VVU)',
    category: 'Private University',
    keywords: 'Oyibi Techiman Kumasi Adventist',
  },
  {
    label: 'Pentecost University',
    category: 'Private University',
    keywords: 'Sowutuom Accra PU',
  },
  {
    label: 'Methodist University Ghana',
    category: 'Private University',
    keywords: 'Dansoman Tema Wenchi MUG',
  },
  {
    label: 'Presbyterian University, Ghana (PUG)',
    category: 'Private University',
    keywords: 'Abetifi Okwahu Akropong Agogo',
  },
  {
    label: 'Catholic University of Ghana (CUG)',
    category: 'Private University',
    keywords: 'Fiapre Sunyani Bono',
  },
  {
    label: 'Christian Service University (CSU)',
    category: 'Private University',
    keywords: 'Kumasi Santasi CSUC',
  },
  {
    label: 'Wisconsin International University College, Ghana',
    category: 'Private University',
    keywords: 'Agbogba Accra Kumasi Nursing Law',
  },
  {
    label: 'Lancaster University Ghana',
    category: 'Private University',
    keywords: 'East Legon Accra UK Transnational',
  },
  {
    label: 'Webster University Ghana',
    category: 'Private University',
    keywords: 'East Legon Accra US',
  },
  {
    label: 'All Nations University (ANU)',
    category: 'Private University',
    keywords: 'Koforidua Engineering Nursing',
  },
  {
    label: 'Regent University College of Science and Technology',
    category: 'Private University',
    keywords: 'McCarthy Hill Accra',
  },
  {
    label: 'Accra Institute of Technology (AIT)',
    category: 'Private University',
    keywords: 'Cantonments Seaview Accra IT Engineering',
  },
  {
    label: 'BlueCrest University College',
    category: 'Private University',
    keywords: 'Kokomlemle Accra IT Fashion Design',
  },
  {
    label: 'Garden City University College (GCUC)',
    category: 'Private University',
    keywords: 'Kenyase Kumasi Nursing Midwifery',
  },
  {
    label: 'Zenith University College',
    category: 'Private University',
    keywords: 'La Trade Fair Accra Law Business',
  },
  {
    label: 'Knutsford University College',
    category: 'Private University',
    keywords: 'East Legon Accra Kumasi',
  },
  {
    label: 'Radford University College',
    category: 'Private University',
    keywords: 'East Legon Accra Fashion Graphic Design',
  },
  {
    label: 'Islamic University College, Ghana (IUCG)',
    category: 'Private University',
    keywords: 'East Legon Adjiringanor Accra',
  },
  {
    label: 'Heritage Christian University College (HCUC)',
    category: 'Private University',
    keywords: 'Amasaman Accra',
  },
  {
    label: 'Dominion University College',
    category: 'Private University',
    keywords: 'Spintex Accra',
  },
  {
    label: 'Kings University College (KUC)',
    category: 'Private University',
    keywords: 'Aplaku Accra',
  },
  {
    label: 'Perez University College',
    category: 'Private University',
    keywords: 'Gomoa Pomadze Winneba',
  },
  {
    label: 'Ghana Baptist University College (GBUC)',
    category: 'Private University',
    keywords: 'Amakom Abuakwa Kumasi',
  },
  {
    label: 'Evangelical Presbyterian University College (EPUC)',
    category: 'Private University',
    keywords: 'Ho Volta',
  },
  {
    label: 'Anglican University College of Technology (ANGUTECH)',
    category: 'Private University',
    keywords: 'Nkoranza Bono East',
  },
  {
    label: 'Spiritan University College',
    category: 'Private University',
    keywords: 'Ejisu Ashanti',
  },
  {
    label: 'Data Link Institute of Business and Technology',
    category: 'Private University',
    keywords: 'Tema Ho',
  },
  {
    label: 'MountCrest University College',
    category: 'Private University',
    keywords: 'Kanda Accra Law Health',
  },
  {
    label: 'Family Health Medical School',
    category: 'Private University',
    keywords: 'Teshie Accra Medicine Nursing',
  },
  {
    label: 'Accra College of Medicine',
    category: 'Private University',
    keywords: 'Manna East Legon Medicine',
  },
  {
    label: 'Ensign Global College',
    category: 'Private University',
    keywords: 'Kpong Eastern Public Health',
  },
  {
    label: 'Nobel International Business School (NIBS)',
    category: 'Private University',
    keywords: 'South Legon Accra DBA MBA',
  },
  {
    label: 'KAAF University College',
    category: 'Private University',
    keywords: 'Gomoa Fetteh Kasoa Engineering Nursing Law',
  },
  {
    label: 'West End University College',
    category: 'Private University',
    keywords: 'Ngleshie Amanfro Kasoa',
  },
  {
    label: 'Jayee University College',
    category: 'Private University',
    keywords: 'McCarthy Hill Accra Journalism Business',
  },
  {
    label: 'Ghana Christian University College',
    category: 'Private University',
    keywords: 'Amrahia Dodowa Road Accra',
  },
  {
    label: 'Maranatha University College',
    category: 'Private University',
    keywords: 'Sowutuom Accra',
  },
  {
    label: 'Marshall University College',
    category: 'Private University',
    keywords: 'Accra',
  },
  {
    label: 'Palm University College',
    category: 'Private University',
    keywords: 'Accra',
  },

  // Notable Colleges of Education & Nursing/Health Colleges
  {
    label: 'Accra College of Education',
    category: 'College of Education',
    keywords: 'Madina Accra Teacher',
  },
  {
    label: 'Wesley College of Education, Kumasi',
    category: 'College of Education',
    keywords: 'WESCO Kumasi Teacher',
  },
  {
    label: 'Presbyterian College of Education, Akropong',
    category: 'College of Education',
    keywords: 'Akropong Akuapem Teacher',
  },
  {
    label: 'Komfo Anokye Nursing and Midwifery Training College',
    category: 'Health Training College',
    keywords: 'Kumasi KATH Nursing Midwifery',
  },
  {
    label: 'Korle-Bu Nursing and Midwifery Training College',
    category: 'Health Training College',
    keywords: 'Accra Korle Bu Nursing Midwifery',
  },
];

export const GHANA_PROGRAMS: AcademicOption[] = [
  // Computing & IT
  { label: 'BSc Computer Science', category: 'Computing & IT', keywords: 'CS Software Programming' },
  { label: 'BSc Information Technology', category: 'Computing & IT', keywords: 'IT Computing Networking' },
  { label: 'BSc Software Engineering', category: 'Computing & IT', keywords: 'SE Dev Coding' },
  { label: 'BSc Computer Engineering', category: 'Computing & IT', keywords: 'Hardware Embedded Systems' },
  { label: 'BSc Data Science and Analytics', category: 'Computing & IT', keywords: 'AI ML Big Data' },
  { label: 'BSc Cybersecurity', category: 'Computing & IT', keywords: 'InfoSec Network Security' },
  { label: 'BSc Management Information Systems (MIS)', category: 'Computing & IT', keywords: 'Business IT Systems' },
  { label: 'BSc Information Systems', category: 'Computing & IT', keywords: 'IS Enterprise Systems' },
  { label: 'BSc Artificial Intelligence', category: 'Computing & IT', keywords: 'AI Machine Learning' },
  { label: 'BTech Computer Science', category: 'Computing & IT', keywords: 'Technical University CS' },
  { label: 'BTech Information Technology', category: 'Computing & IT', keywords: 'Technical University IT' },
  { label: 'HND Computer Science', category: 'Computing & IT', keywords: 'Technical University Diploma' },
  { label: 'BSc Telecommunications Engineering', category: 'Computing & IT', keywords: 'Telecom Networks GCTU KNUST' },

  // Engineering & Built Environment
  { label: 'BSc Civil Engineering', category: 'Engineering', keywords: 'Structural Construction Roads' },
  { label: 'BSc Mechanical Engineering', category: 'Engineering', keywords: 'Thermodynamics Machines Manufacturing' },
  { label: 'BSc Electrical and Electronic Engineering', category: 'Engineering', keywords: 'EEE Power Circuits' },
  { label: 'BSc Chemical Engineering', category: 'Engineering', keywords: 'Process Chemistry Petrochemical' },
  { label: 'BSc Petroleum Engineering', category: 'Engineering', keywords: 'Oil Gas Reservoir' },
  { label: 'BSc Mining Engineering', category: 'Engineering', keywords: 'UMaT Minerals Extraction' },
  { label: 'BSc Geological Engineering', category: 'Engineering', keywords: 'Geology Minerals UMaT KNUST' },
  { label: 'BSc Geomatic Engineering', category: 'Engineering', keywords: 'Surveying GIS Mapping' },
  { label: 'BSc Biomedical Engineering', category: 'Engineering', keywords: 'Medical Devices Bioengineering' },
  { label: 'BSc Aerospace Engineering', category: 'Engineering', keywords: 'Aviation Aeronautics KNUST' },
  { label: 'BSc Agricultural Engineering', category: 'Engineering', keywords: 'Agric Mechanization Irrigation' },
  { label: 'BSc Industrial Engineering', category: 'Engineering', keywords: 'Operations Systems Optimization' },
  { label: 'BSc Materials Engineering', category: 'Engineering', keywords: 'Metallurgy Polymers' },
  { label: 'BSc Marine Engineering', category: 'Engineering', keywords: 'RMU Naval Shipping' },
  { label: 'BSc Environmental Engineering', category: 'Engineering', keywords: 'Water Sanitation Sustainability' },
  { label: 'BSc Renewable Energy Engineering', category: 'Engineering', keywords: 'UENR Solar Power' },
  { label: 'BSc Architecture', category: 'Built Environment', keywords: 'Design Buildings Urban' },
  { label: 'BSc Quantity Surveying and Construction Economics', category: 'Built Environment', keywords: 'QS Costing Construction' },
  { label: 'BSc Construction Technology and Management', category: 'Built Environment', keywords: 'Building Tech' },
  { label: 'BSc Land Economy', category: 'Built Environment', keywords: 'Valuation Property Surveying' },
  { label: 'BSc Real Estate', category: 'Built Environment', keywords: 'Property Management Valuation' },
  { label: 'BSc Development Planning', category: 'Built Environment', keywords: 'Urban Regional Planning' },
  { label: 'BSc Human Settlement Planning', category: 'Built Environment', keywords: 'Urban Design Planning' },
  { label: 'BTech Civil Engineering', category: 'Engineering', keywords: 'Technical University Civil' },
  { label: 'BTech Electrical/Electronic Engineering', category: 'Engineering', keywords: 'Technical University EEE' },
  { label: 'BTech Mechanical Engineering', category: 'Engineering', keywords: 'Technical University Mechanical' },
  { label: 'BTech Building Technology', category: 'Built Environment', keywords: 'Technical University Construction' },

  // Health, Medicine & Allied Sciences
  { label: 'MBChB Medicine and Surgery', category: 'Health & Medicine', keywords: 'Medical Doctor MBChB UG KNUST UDS UCC UHAS' },
  { label: 'BDS Dental Surgery', category: 'Health & Medicine', keywords: 'Dentistry Oral Health' },
  { label: 'PharmD Doctor of Pharmacy', category: 'Health & Medicine', keywords: 'Pharmacy Pharmacology Drugs' },
  { label: 'BSc Nursing', category: 'Health & Medicine', keywords: 'General Nursing Clinical Health' },
  { label: 'BSc Midwifery', category: 'Health & Medicine', keywords: 'Maternal Obstetrics Nursing' },
  { label: 'BSc Public Health', category: 'Health & Medicine', keywords: 'Epidemiology Community Health' },
  { label: 'BSc Physician Assistantship', category: 'Health & Medicine', keywords: 'PA Medical Clinical' },
  { label: 'BSc Medical Laboratory Science', category: 'Health & Medicine', keywords: 'MLS Diagnostics Pathology' },
  { label: 'BSc Physiotherapy', category: 'Health & Medicine', keywords: 'Rehabilitation Physical Therapy' },
  { label: 'BSc Dietetics', category: 'Health & Medicine', keywords: 'Clinical Nutrition Food' },
  { label: 'BSc Nutrition and Food Science', category: 'Health & Medicine', keywords: 'Nutrition Diet Food' },
  { label: 'OD Doctor of Optometry', category: 'Health & Medicine', keywords: 'Eye Vision Optometry UCC KNUST' },
  { label: 'BSc Diagnostic Imaging / Radiography', category: 'Health & Medicine', keywords: 'Radiology Medical Imaging X-ray' },
  { label: 'BSc Herbal Medicine', category: 'Health & Medicine', keywords: 'Phytotherapy KNUST UHAS' },
  { label: 'BSc Health Information Management', category: 'Health & Medicine', keywords: 'Medical Records HIM UCC' },
  { label: 'BSc Occupational Therapy', category: 'Health & Medicine', keywords: 'OT Rehabilitation' },
  { label: 'BSc Speech and Language Therapy', category: 'Health & Medicine', keywords: 'SLT Communication Therapy' },
  { label: 'DVM Veterinary Medicine', category: 'Health & Medicine', keywords: 'Animal Health Vet UG KNUST' },

  // Business, Finance & Administration
  { label: 'BSc Business Administration', category: 'Business & Finance', keywords: 'Management BBA Admin' },
  { label: 'BSc Accounting', category: 'Business & Finance', keywords: 'CA Audit Taxation Financial' },
  { label: 'BSc Banking and Finance', category: 'Business & Finance', keywords: 'Finance Investment Banks' },
  { label: 'BSc Finance', category: 'Business & Finance', keywords: 'Corporate Finance Markets' },
  { label: 'BSc Marketing', category: 'Business & Finance', keywords: 'Brand Sales Digital Marketing' },
  { label: 'BSc Human Resource Management', category: 'Business & Finance', keywords: 'HRM People Operations' },
  { label: 'BSc Procurement and Supply Chain Management', category: 'Business & Finance', keywords: 'Logistics Operations Supply' },
  { label: 'BSc Logistics and Transport Management', category: 'Business & Finance', keywords: 'Shipping Supply Chain RMU KNUST' },
  { label: 'BSc Actuarial Science', category: 'Business & Finance', keywords: 'Risk Math Insurance Finance' },
  { label: 'BSc Insurance and Risk Management', category: 'Business & Finance', keywords: 'Underwriting Risk UPSA UG' },
  { label: 'BSc Entrepreneurship', category: 'Business & Finance', keywords: 'Startups Venture Innovation' },
  { label: 'BSc Hospitality and Tourism Management', category: 'Business & Finance', keywords: 'Hotels Travel UCC' },
  { label: 'BSc International Business', category: 'Business & Finance', keywords: 'Global Trade Commerce' },
  { label: 'BCom Bachelor of Commerce', category: 'Business & Finance', keywords: 'UCC Commerce Accounting Finance' },
  { label: 'BBA Accounting and Finance', category: 'Business & Finance', keywords: 'Business Admin Accounting' },
  { label: 'BSc Agribusiness Management', category: 'Business & Finance', keywords: 'Agric Business Economics' },
  { label: 'BTech Accountancy', category: 'Business & Finance', keywords: 'Technical University Accounting' },
  { label: 'BTech Marketing', category: 'Business & Finance', keywords: 'Technical University Marketing' },
  { label: 'HND Accountancy', category: 'Business & Finance', keywords: 'Technical University Diploma' },

  // Law, Economics & Social Sciences
  { label: 'LLB Bachelor of Laws', category: 'Law & Social Sciences', keywords: 'Law Legal Barrister Attorney' },
  { label: 'BA Economics', category: 'Law & Social Sciences', keywords: 'Macroeconomics Micro Econometrics' },
  { label: 'BSc Economics', category: 'Law & Social Sciences', keywords: 'Quantitative Economics Econometrics' },
  { label: 'BA Political Science', category: 'Law & Social Sciences', keywords: 'Politics Governance Public Policy' },
  { label: 'BA Sociology', category: 'Law & Social Sciences', keywords: 'Social Research Society' },
  { label: 'BA Psychology', category: 'Law & Social Sciences', keywords: 'Mental Health Cognitive Behavioural' },
  { label: 'BSc Psychology', category: 'Law & Social Sciences', keywords: 'Clinical Neuropsychology' },
  { label: 'BA Social Work', category: 'Law & Social Sciences', keywords: 'Community Welfare NGO' },
  { label: 'BA Geography and Resource Development', category: 'Law & Social Sciences', keywords: 'GIS Environment Human Geography' },
  { label: 'BA History', category: 'Law & Social Sciences', keywords: 'Historical Studies' },
  { label: 'BA Archaeology and Heritage Studies', category: 'Law & Social Sciences', keywords: 'Museums Cultural Heritage' },
  { label: 'BA Philosophy and Classics', category: 'Law & Social Sciences', keywords: 'Ethics Logic' },
  { label: 'BA Study of Religions', category: 'Law & Social Sciences', keywords: 'Theology Religious Studies' },
  { label: 'BA Linguistics', category: 'Law & Social Sciences', keywords: 'Languages Phonetics' },
  { label: 'BA English', category: 'Law & Social Sciences', keywords: 'Literature Writing' },
  { label: 'BA French', category: 'Law & Social Sciences', keywords: 'Modern Languages' },
  { label: 'BA International Relations', category: 'Law & Social Sciences', keywords: 'Diplomacy Foreign Policy' },
  { label: 'BA Development Studies', category: 'Law & Social Sciences', keywords: 'UDS SDGs Rural Urban' },
  { label: 'BA Population and Health', category: 'Law & Social Sciences', keywords: 'Demography UCC' },
  { label: 'BA Criminology and Criminal Justice', category: 'Law & Social Sciences', keywords: 'Forensics Policing Justice' },

  // Natural, Physical & Mathematical Sciences
  { label: 'BSc Mathematics', category: 'Natural Sciences', keywords: 'Pure Applied Math Calculus' },
  { label: 'BSc Statistics', category: 'Natural Sciences', keywords: 'Probability Data Modeling' },
  { label: 'BSc Physics', category: 'Natural Sciences', keywords: 'Mechanics Optics Quantum' },
  { label: 'BSc Chemistry', category: 'Natural Sciences', keywords: 'Organic Analytical Industrial' },
  { label: 'BSc Biochemistry', category: 'Natural Sciences', keywords: 'Molecular Biology Metabolism' },
  { label: 'BSc Biological Sciences', category: 'Natural Sciences', keywords: 'Biology Botany Zoology' },
  { label: 'BSc Biotechnology', category: 'Natural Sciences', keywords: 'Genetics Molecular Bio' },
  { label: 'BSc Environmental Science', category: 'Natural Sciences', keywords: 'Ecology Climate Conservation' },
  { label: 'BSc Earth Science / Geology', category: 'Natural Sciences', keywords: 'Minerals Geophysics' },
  { label: 'BSc Meteorology and Climate Science', category: 'Natural Sciences', keywords: 'Weather Atmospheric KNUST' },
  { label: 'BSc Marine and Fisheries Science', category: 'Natural Sciences', keywords: 'Oceanography Aquatic UG UCC' },
  { label: 'BSc Food Science and Technology', category: 'Natural Sciences', keywords: 'Food Processing Quality' },
  { label: 'BSc Forensic Science', category: 'Natural Sciences', keywords: 'Forensics Crime Lab UCC' },

  // Agriculture & Natural Resources
  { label: 'BSc Agriculture', category: 'Agriculture', keywords: 'Agronomy Farming Livestock' },
  { label: 'BSc Crop Science', category: 'Agriculture', keywords: 'Horticulture Agronomy' },
  { label: 'BSc Animal Science', category: 'Agriculture', keywords: 'Livestock Poultry' },
  { label: 'BSc Natural Resource Management', category: 'Agriculture', keywords: 'Forestry Conservation' },
  { label: 'BSc Forestry and Wildlife Management', category: 'Agriculture', keywords: 'Silviculture Ecology' },
  { label: 'BSc Aquaculture and Water Resources', category: 'Agriculture', keywords: 'Fish Farming Hydrology' },

  // Education
  { label: 'BEd Basic Education', category: 'Education', keywords: 'Primary JHS Teaching UEW UCC' },
  { label: 'BEd Early Childhood Education', category: 'Education', keywords: 'Kindergarten Preschool Teaching' },
  { label: 'BEd Mathematics Education', category: 'Education', keywords: 'Math Teaching Pedagogy' },
  { label: 'BEd Science Education', category: 'Education', keywords: 'Physics Chemistry Biology Teaching' },
  { label: 'BEd English Education', category: 'Education', keywords: 'Language Arts Teaching' },
  { label: 'BEd Social Studies Education', category: 'Education', keywords: 'Civic History Teaching' },
  { label: 'BEd Information and Communication Technology (ICT)', category: 'Education', keywords: 'Computer Education Teaching' },
  { label: 'BEd Technical Education', category: 'Education', keywords: 'AAMUSTED TVET Construction Auto' },
  { label: 'BEd Home Economics', category: 'Education', keywords: 'Food Textiles Family' },
  { label: 'BEd Physical Education and Sports', category: 'Education', keywords: 'Kinesiology Athletics' },

  // Communication, Media & Creative Arts
  { label: 'BA Communication Studies', category: 'Media & Arts', keywords: 'Media PR Journalism UniMAC GIJ' },
  { label: 'BA Journalism', category: 'Media & Arts', keywords: 'News Broadcasting Media' },
  { label: 'BA Public Relations Management', category: 'Media & Arts', keywords: 'Corporate Comm Branding' },
  { label: 'BFA Film Directing and Production', category: 'Media & Arts', keywords: 'Cinema Television NAFTI' },
  { label: 'BA Graphic Design', category: 'Media & Arts', keywords: 'Visual Communication UI UX' },
  { label: 'BA Industrial Art', category: 'Media & Arts', keywords: 'Ceramics Textiles Metals KNUST' },
  { label: 'BA Publishing Studies', category: 'Media & Arts', keywords: 'Editorial Print Book KNUST' },
  { label: 'BA Theatre Arts', category: 'Media & Arts', keywords: 'Drama Performing Arts' },
  { label: 'BMus Music', category: 'Media & Arts', keywords: 'Musicology Performance' },

  // Popular Postgraduate Degrees
  { label: 'MSc Computer Science', category: 'Postgraduate', keywords: 'Masters Computing AI' },
  { label: 'MSc Data Science', category: 'Postgraduate', keywords: 'Masters Analytics ML' },
  { label: 'MBA Finance', category: 'Postgraduate', keywords: 'Masters Business Finance' },
  { label: 'MBA Marketing', category: 'Postgraduate', keywords: 'Masters Business Brand' },
  { label: 'MBA Human Resource Management', category: 'Postgraduate', keywords: 'Masters HR' },
  { label: 'MSc Supply Chain Management', category: 'Postgraduate', keywords: 'Masters Logistics Procurement' },
  { label: 'MPH Master of Public Health', category: 'Postgraduate', keywords: 'Masters Public Health' },
  { label: 'LLM Master of Laws', category: 'Postgraduate', keywords: 'Masters Law' },
  { label: 'MPhil Economics', category: 'Postgraduate', keywords: 'Research Economics' },
];
