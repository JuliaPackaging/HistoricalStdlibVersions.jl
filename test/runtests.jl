import HistoricalStdlibVersions
import Pkg
using Test

@test !isempty(Pkg.Types.STDLIBS_BY_VERSION)

# Upgradable stdlibs are recorded apart from the regular ones so that what `register!()`
# hands to Pkg is unchanged.
let regular = HistoricalStdlibVersions.STDLIBS_BY_VERSION,
    upgradable = HistoricalStdlibVersions.UPGRADABLE_STDLIBS_BY_VERSION
    @test !isempty(upgradable)
    @test issorted(first.(upgradable))
    @test issorted(first.(regular))
    for (jv, stdlibs) in upgradable
        idx = findlast(((v, _),) -> v <= jv, regular)
        @test isdisjoint(keys(stdlibs), keys(regular[idx].second))
    end
end
