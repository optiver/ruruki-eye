describe('Common libs and helpers', function() {
    it('flatten a dictionary into a decorated string', function() {
        expect(dictToStr({
	        key: 'value'
        })).toBe('<span class="info-properties-key">key</span>: ' +
            '<span class="info-properties-value">value</span>'
        );
    });
});

// Custom Filter
describe('Custom filters', function() {
    it('filters can be created', function() {
        var f1 = new CustomFilter('f1', '#ccc');

        expect(f1.name).toBe('f1');
        expect(f1.color).toBe('#ccc');
    });

    it('filters are encapsulated', function() {
        var f1 = new CustomFilter('f1');
        var f2 = new CustomFilter('f2');

        f1.name = 'F1';

        expect(f2.name).toBe('f2');
    });

    it('first filter can be added to sequences', function() {
        var s = new CustomFilter('f1');

        s.add('filter1');

        expect(s.filters[0]).toBe('filter1');
        expect(s.linkTypes.length).toBe(0);
    });

    it('filters and types can be added to sequences', function() {
        var s = new CustomFilter('f1');

        s.add('filter1');
        s.add('filter2', 'OR');

        expect(s.filters[0]).toBe('filter1');
        expect(s.filters[1]).toBe('filter2');
        expect(s.linkTypes.length).toBe(1);
        expect(s.linkTypes[0]).toBe('OR');
    });

    it('first filter can be removed from sequences', function() {
        var s = new CustomFilter('f1');

        s.add('filter1');
        s.add('filter2', 'OR');

        s.remove('filter1');

        expect(s.filters[0]).toBe('filter2');
        expect(s.linkTypes.length).toBe(0);
    });

    it('filter changes reset results', function() {
        var s = new CustomFilter('f1');

	s.result = 'Results';

        s.add('filter1');
        s.add('filter2', 'OR');

        s.remove('filter1');

        expect(s.result).toBe(null);
    });


    it('middle filter can be removed from sequences', function() {
        var s = new CustomFilter('f1');

        s.add('filter1');
        s.add('filter2', 'OR');
        s.add('filter3', 'AND');

        s.remove('filter2');

        expect(s.filters[0]).toBe('filter1');
        expect(s.filters[1]).toBe('filter3');
        expect(s.linkTypes.length).toBe(1);
        expect(s.linkTypes[0]).toBe('AND');
    });

    it('last filter can be removed from sequences', function() {
        var s = new CustomFilter('f1');

        s.add('filter1');
        s.add('filter2', 'OR');
        s.add('filter3', 'AND');

        s.remove('filter3');

        expect(s.filters[0]).toBe('filter1');
        expect(s.filters[1]).toBe('filter2');
        expect(s.linkTypes.length).toBe(1);
        expect(s.linkTypes[0]).toBe('OR');
    });

    it('can iterate through sequence', function() {
        var s = new CustomFilter('f1');
        var ds = [];

        s.add('filter1');
        s.add('filter2', 'OR');
        s.add('filter3', 'AND');

        s.forEach(function(f, l) {
            ds.push([f, l]); 
        });

        expect(ds[0][0]).toBe('filter1');
        expect(ds[0][1]).toBe(undefined);
        expect(ds[1][0]).toBe('filter2');
        expect(ds[1][1]).toBe('OR');
        expect(ds[2][0]).toBe('filter3');
        expect(ds[2][1]).toBe('AND');
    });

});
