# TODO

1. [ ] v testech nepoužívat hodnoty překladů. Místo toho namockovat překladovou funkci tak aby vracela klíč a v testovacích souborech testovat přítomnost toho klíče tzn pseudokod:
   ```tsx
     const mockedT = (key: MessageKey, substitutes: Substitutes) => `${key}: ${substitutes.join(',')}
     ...
      screen.getByText(
        mockedT('errHolderLimitReached')
      )
   ```
   tím zabráníme tomu aby testy padaly když se změní jen hodnota překladu
