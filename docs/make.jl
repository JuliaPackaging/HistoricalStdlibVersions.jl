#!/usr/bin/env julia
#
# Builds the GitHub Pages site into `docs/build/`.
#
# This is deliberately not a Documenter site: the only content is an interactive
# visualization of stdlib versions across Julia releases. The static page lives in
# `docs/src/`; this script copies it and generates `data.js` from `src/version_map.jl`.
#
# Usage: julia docs/make.jl

const repo_root = dirname(@__DIR__)
include(joinpath(repo_root, "src", "StdlibInfo.jl"))
include(joinpath(repo_root, "src", "version_map.jl"))

# Minimal JSON writer; the data is plain strings, numbers, bools, arrays and dicts,
# so we avoid pulling in a dependency just for this.
json(io::IO, x::Nothing) = print(io, "null")
json(io::IO, x::Bool) = print(io, x ? "true" : "false")
json(io::IO, x::Integer) = print(io, x)
json(io::IO, x::VersionNumber) = json(io, string(x))
function json(io::IO, s::AbstractString)
    print(io, '"')
    for c in s
        if c == '"'
            print(io, "\\\"")
        elseif c == '\\'
            print(io, "\\\\")
        elseif c == '\n'
            print(io, "\\n")
        elseif c < ' '
            print(io, "\\u", lpad(string(UInt16(c), base=16), 4, '0'))
        else
            print(io, c)
        end
    end
    print(io, '"')
end
function json(io::IO, xs::Union{AbstractVector,Tuple})
    print(io, '[')
    for (i, x) in enumerate(xs)
        i > 1 && print(io, ',')
        json(io, x)
    end
    print(io, ']')
end
function json(io::IO, d::AbstractDict)
    print(io, '{')
    for (i, (k, v)) in enumerate(d)
        i > 1 && print(io, ',')
        json(io, string(k))
        print(io, ':')
        json(io, v)
    end
    print(io, '}')
end
json(io::IO, nt::NamedTuple) = json(io, Dict(pairs(nt)))

function git(args...)
    try
        return strip(read(setenv(Cmd(["git", args...]); dir=repo_root), String))
    catch
        return ""
    end
end

julia_versions = first.(STDLIBS_BY_VERSION)
by_version = Dict(STDLIBS_BY_VERSION)

# Stable identity is the UUID; names never change in the data but the UUID is what Pkg uses.
names = Dict{UUID,String}()
for (_, stdlibs) in STDLIBS_BY_VERSION, (uuid, info) in stdlibs
    names[uuid] = info.name
end
sorted_uuids = sort(collect(keys(names)); by = u -> lowercase(names[u]))

stdlibs = map(sorted_uuids) do uuid
    # One entry per Julia column: `nothing` if the stdlib is absent in that release,
    # otherwise the version (or `nothing` for unversioned) plus dependency names.
    entries = map(julia_versions) do jv
        info = get(by_version[jv], uuid, nothing)
        info === nothing && return nothing
        return (
            v = info.version,
            d = sort([names[d] for d in info.deps]),
            w = sort([names[d] for d in info.weakdeps]),
        )
    end
    return (
        name = names[uuid],
        uuid = string(uuid),
        jll = endswith(names[uuid], "_jll"),
        registered = !haskey(UNREGISTERED_STDLIBS, uuid),
        entries = entries,
    )
end

pkg_version = let m = nothing
    for line in eachline(joinpath(repo_root, "Project.toml"))
        m = match(r"^version\s*=\s*\"([^\"]+)\"", line)
        m !== nothing && break
    end
    m === nothing ? "" : m.captures[1]
end

data = (
    package_version = pkg_version,
    commit = git("rev-parse", "--short", "HEAD"),
    data_updated = git("log", "-1", "--format=%cs", "--", "src/version_map.jl"),
    julia_versions = julia_versions,
    stdlibs = stdlibs,
)

build_dir = joinpath(@__DIR__, "build")
src_dir = joinpath(@__DIR__, "src")
rm(build_dir; force=true, recursive=true)
mkpath(build_dir)
for f in readdir(src_dir)
    cp(joinpath(src_dir, f), joinpath(build_dir, f))
end
# Written as a script rather than fetched JSON so the page also works from a `file://` URL.
open(joinpath(build_dir, "data.js"), "w") do io
    print(io, "window.HSV_DATA = ")
    json(io, data)
    println(io, ";")
end
# Tell GitHub Pages not to run Jekyll over the output.
touch(joinpath(build_dir, ".nojekyll"))

@info "Built site" build_dir julia_versions=length(julia_versions) stdlibs=length(stdlibs)
