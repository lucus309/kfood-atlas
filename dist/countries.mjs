const regionNames = new Intl.DisplayNames(['ko'], { type: 'region' });

export function countryName(country) {
  if (/[가-힣]/.test(country.name) || !/^[A-Z]{2}$/.test(country.iso)) return country.name;
  return regionNames.of(country.iso);
}

export function localizeCountries(data) {
  return {
    ...data,
    countries: data.countries.map((country) => ({ ...country, name: countryName(country) })),
  };
}
